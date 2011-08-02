/*
    ferret.js
    ---------
    Copyright (C) 2011 - Marco Aurélio Buono Carone
    MIT licensed
*/

var util = require('util')
var mongodb = require('mongodb')
var EventEmitter = require('events').EventEmitter

var Ferret = module.exports = function(database_name, host, port) {
    var self = this
    // Default values for parameters
    if (database_name === undefined) { database_name = 'test' }
    if (host === undefined) { host = '127.0.0.1' }
    if (port === undefined) { port = 27017 }
    
    // Create server and database connection objects
    this._server = new mongodb.Server(host, port, { auto_reconnect: false })
    this._db = new mongodb.Db(database_name, this._server, {})
    
    // Initialize state variables, collection cache, ready queue and models
    this._ready = this._error = false
    this._collections = {}
    this._readyQueue = []
    this._models = {}
    
    // Connect
    this._db.open(function(err, db) {
        if (err) { 
            // Switch to proper state and emit error event
            self._error = true
            if (self.listeners('error').length > 0) {
                self.emit('error', err)
            }
            
            // Notify ready queue functions about the error, and clear it
            for (var i = 0; i < self._readyQueue.length; i++) {
                self._readyQueue[i](err)
            }
            self._readyQueue = []
        }
        else {
            // Switch to proper state and emit ready event
            self._ready = true
            self._connected = true
            self.emit('ready', db)
            
            // Process ready queue and clear it
            for (var i = 0; i < self._readyQueue.length; i++) {
                self._readyQueue[i](null)
            }
            self._readyQueue = []
        }
    })
    this._db.on('close', function() {
        // Switch to proper state, clear connection cache and emit disconnect event
        self._connected = false
        this._collections = {}
        self.emit('disconnect')
        
        // Attempt to reconnect manually
        var reconnectInterval = setInterval(function() {
            if (!self._connected) {
                self._server = new mongodb.Server(host, port, { auto_reconnect: false })
                self._db = new mongodb.Db(database_name, self._server, {})
                self._db.open(function(err, db) {
                    if (!err) {
                        self._connected = true;
                        self.emit('reconnect')
                    }
                })             
            } else {
                clearInterval(reconnectInterval);
            }       
        }, 2000)
    })
}

util.inherits(Ferret, EventEmitter)

// Run a function right now if ready, or queue it for later
var _ready = function(ferret, fn) {
    if (ferret._ready) {
        return fn(null)
    } else if (ferret._error) {
        return fn(new Error('Not connected to the database'))
    } else {
        ferret._readyQueue.push(fn)
    }
}

// Try loading a collection from the cache. If that fails, get it from the driver
var _collection = function(ferret, collection_name, callback) {
    _ready(ferret, function(err) {
        if (err) {
            process.nextTick(function() {
                callback(err)  
            })
        } else {
            if (ferret._collections[collection_name]) {
                process.nextTick(function() {
                    callback(null, ferret._collections[collection_name])
                })
            } else {
                ferret._db.collection(collection_name, function(err, collection){
                    if (!err) { ferret._collections[collection_name] = collection }
                    callback(err, collection)
                })
            }
        }
    })
}

// Get the instance's current state
Ferret.prototype.state = function() {
    if (this._ready) {
        if (this._connected) {
            return 'ready+connected'
        } else {
            return 'ready+disconnected'
        }
    } else {
        if (this._error) {
            return 'error'
        } else {
            return 'start'
        }
    }
}

/*
 * MongoDB operations
 */

Ferret.prototype.find = function(collection_name, query, fields, options) {
    var ee = new EventEmitter()
    if (query === undefined) { query = {} }
    _collection(this, collection_name, function(err, collection) {
        if (err) { ee.emit('error', err) }
        else {
            collection.find(query, fields, options, function(err, cursor) {
                if (err) { ee.emit('error', err) }
                else {
                    if (ee.listeners('each').length > 0) {
                        cursor.each(function(err, each) {
                            if (err) { ee.emit('error', err) }
                            else { ee.emit('each', each) }
                        })
                    } else if (ee.listeners('success').length > 0) {
                        cursor.toArray(function(err, result) {
                            if (err) { ee.emit('error', err) }
                            else { ee.emit('success', result) }
                        })
                    } else {
                        process.nextTick(function() {
                            ee.emit('cursor', cursor)
                        })
                    }
                }
            })            
        }
    })
    return ee
}

Ferret.prototype.findOne = function(collection_name, query) {
    var ee = new EventEmitter()
    _collection(this, collection_name, function(err, collection) {
        if (err) { ee.emit('error', err) }
        else {
            collection.findOne(query, function(err, result) {
                if (err) { ee.emit('error', err) }
                else { ee.emit('success', result) }
            })
        }
    })
    return ee
}

Ferret.prototype.insert = function(collection_name, docs) {
    var ee = new EventEmitter()
    _collection(this, collection_name, function(err, collection) {
        if (err) { ee.emit('error', err) }
        else {
            collection.insert(docs, { safe: true }, function(err, docs) {
                if (err) { ee.emit('error', err) }
                else { ee.emit('success', docs) }
            })
        }
    })
    return ee
}

Ferret.prototype.save = function(collection_name, doc) {
    var ee = new EventEmitter()
    _collection(this, collection_name, function(err, collection) {
        if (err) { ee.emit('error', err) }
        else {
            collection.save(doc, { safe: true }, function(err, doc) {
                if (err) { ee.emit('error', err) }
                else { ee.emit('success', doc) }
            })
        }
    })
    return ee
}

Ferret.prototype.update = function(collection_name, criteria, replacement, options) {
    var multi, upsert
    var ee = new EventEmitter()
    if (options) { 
        multi = options.multi
        upsert = options.upsert
    } else {
        multi = upsert = false
    }
    _collection(this, collection_name, function(err, collection) {
        if (err) { ee.emit('error', err) }
        else {
            collection.update(criteria, replacement, { safe: true, multi: multi, upsert: upsert }, function(err, count) {
                if (err) { ee.emit('error', err) }
                else { ee.emit('success', count) }
            })
        }
    })
    return ee
}

Ferret.prototype.remove = function(collection_name, criteria) {
    var ee = new EventEmitter()
    _collection(this, collection_name, function(err, collection) {
        if (err) { ee.emit('error', err) }
        else {
            collection.remove(criteria, { safe: true }, function(err, count) {
                if (err) { ee.emit('error', err) }
                else { ee.emit('success', count) }
            })
        }
    })
    return ee
}

/*
 * FerretCollection
 */

var FerretCollection = function(ferret, name) {
    this._ferret = ferret
    this._name = name
}

FerretCollection.prototype.find = function(query, fields, options) {
    return this._ferret.find(this._name, query, fields, options)
}

FerretCollection.prototype.findOne = function(query) {
    return this._ferret.findOne(this._name, query)
}

FerretCollection.prototype.insert = function(docs) {
    return this._ferret.insert(this._name, docs)
}

FerretCollection.prototype.save = function(doc) {
    return this._ferret.save(this._name, doc)
}

FerretCollection.prototype.update = function(criteria, replacement, options) {
    return this._ferret.update(this._name, criteria, replacement, options)
}

FerretCollection.prototype.remove = function(criteria) {
    return this._ferret.remove(this._name, criteria)
}

Ferret.prototype.collection = function(name) {
    return new FerretCollection(this, name)
}

// Model Stub
Ferret.prototype.model = function(name, schema) {
    // load module on first call
    require('./model')(Ferret);

    // call the proper function
    return this.model(name, schema)
}

var sharedFerret = null

// Connect to a server
Ferret.connect = function(database_name, host, port) {
    var ferret = new Ferret(database_name, host, port)
    if (!sharedFerret) { sharedFerret = ferret }
    return ferret
}

var _ensureSharedFerret = function() {
    if (!sharedFerret) sharedFerret = new Ferret()
    return sharedFerret
}

// Get or set the shared instance
Ferret.shared = function(ferret) {
    if (ferret) {
        return (sharedFerret = ferret)
    } else {
        return _ensureSharedFerret()
    }
}

/*
 * sharedFerret methods replicated on Ferret, for convenience
 */
 
Ferret.state = function() {
    return _ensureSharedFerret().state()
}

Ferret.find = function(collection_name, query, fields, options) {
    return _ensureSharedFerret().find(collection_name, query, fields, options)
}

Ferret.findOne = function(collection_name, query) {
    return _ensureSharedFerret().findOne(collection_name, query)
}

Ferret.insert = function(collection_name, docs) {
    return _ensureSharedFerret().insert(collection_name, docs)
}

Ferret.save = function(collection_name, doc) {
    return _ensureSharedFerret().save(collection_name, doc)
}

Ferret.update = function(collection_name, criteria, replacement, options) {
    return _ensureSharedFerret().update(collection_name, criteria, replacement, options)
}

Ferret.remove = function(collection_name, criteria) {
    return _ensureSharedFerret().update(collection_name, criteria)
}

Ferret.collection = function(name) {
    return new FerretCollection(_ensureSharedFerret(), name)
}

Ferret.model = function(name, schema) {
    return _ensureSharedFerret().model(name, schema)
}

/*
 * EventEmitter methods replicated on Ferret, for convenience
 */

Ferret.on = Ferret.addListener = function(event, callback) {
    return _ensureSharedFerret().on(event, callback)
}

Ferret.once = function(event, callback) {
    return _ensureSharedFerret().once(event, callback)
}

Ferret.removeListener = function(event, callback) {
    return _ensureSharedFerret().removeListener(event, callback)
}

Ferret.removeAllListeners = function(event) {
    return _ensureSharedFerret().removeListener(event)
}

Ferret.setMaxListeners = function(max) {
    return _ensureSharedFerret().setMaxListeners(max)    
}

Ferret.listeners = function(event) {
    return _ensureSharedFerret().listeners(event)    
}

Ferret.emit = function() {
    return _ensureSharedFerret().emit.apply(sharedFerret, arguments)
}
