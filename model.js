var EventEmitter = require('events').EventEmitter

module.exports = function(Ferret) {

var _isSpecial = function(obj) {
    for (var key in obj) {
        if (key.charAt(0) == '$') {
            return true
        }
    }
    return false
}

var _initialize = function(root, obj, internalSchema, values, keyChain, loadOrSet) {
    var internalData = {}
    for (var key in internalSchema) {
        (function(key) {
            if (internalSchema[key].$default !== undefined) {
                if (values && values[key] !== undefined) {
                    internalData[key] = internalSchema[key][loadOrSet](values[key])
                    if (internalData[key] === undefined) {
                        internalData[key] = values[key]
                    }
                } else {
                    internalData[key] = internalSchema[key].$default
                }
            
                Object.defineProperty(obj, key, {
                    get: function() {
                        var value = internalData[key]
                        var newValue = internalSchema[key].$get.call(root, value)
                        if (newValue === undefined) {
                            newValue = value
                        }
                        return newValue
                    },
                    set: function(value) {
                        var newValue = internalSchema[key].$set.call(root, value)
                        if (newValue === undefined) {
                            newValue = value
                        }
                        internalData[key] = newValue
                    },
                    configurable: false,
                    enumerable: true
                })
            
            } else {
                Object.defineProperty(obj, key, { value: {}, enumerable: true })
                internalData[key] = _initialize(root, obj[key], internalSchema[key], (values ? values[key] : null), keyChain.concat([key]), loadOrSet)
            }
        })(key)
    }
    return internalData
}

Ferret.prototype.model = function(name, schema) {
    if (!schema) { return this._models[name] }
    
    var ferret = this
    var internalSchema
    
    var FerretModel = function(values, options) {
        var loadOrSet = (options && options.deserialize) ? '$load' : '$set'
        Object.defineProperty(this, '_internalDocument', {
            value: _initialize(this, this, internalSchema, values, [], loadOrSet)
        })
        
        if (options && options.deserialize) {
            this._internalDocument._id = values._id
        }
        
        Object.defineProperty(this, '_id', {
            get: function() {
                return this._internalDocument._id
            },
            enumerable: true
        })
    }
    
    var __buildInternalSchema = function(schema) {
       var internalSchema = {}
       
        for (var key in schema) {
            var internalValue

            (function(key) {
                if (schema[key] === String) {
                    internalValue = {
                        $get: function() {},
                        $set: function(value) { 
                            if (!((typeof(value) == 'string') || (value instanceof String))) {
                                throw new Error(key + ' must be a string')
                            }
                        },
                        $load: function(value) { return (new String(value)).valueOf() },
                        $store: function() {},
                        $default: ''
                    }
                } else if (schema[key] === Number) {
                    internalValue = {
                        $get: function() {},
                        $set: function(value) { 
                            if (!((typeof(value) == 'number') || (value instanceof Number))) {
                                throw new Error(key + ' must be a number')
                            }
                        },
                        $load: function(value) { return (new Number(value)).valueOf() },
                        $store: function() {},
                        $default: NaN
                    }
                } else if (schema[key] === Boolean) {
                    internalValue = {
                        $get: function() {},
                        $set: function(value) { 
                            if (!((typeof(value) == 'boolean') || (value instanceof Boolean))) {
                                throw new Error(key + ' must be a boolean')
                            }
                        },
                        $load: function(value) { 
                            if (value == 1 || value == 'true') {
                                return true
                            } else {
                                return false
                            }
                        },
                        $store: function() {},
                        $default: false
                    }
                } else if (typeof(schema[key]) == 'function') {
                    throw new Error('unimplemented')
                } else if (_isSpecial(schema[key])) {
                    internalValue = {
                        $get: (schema[key].$get !== undefined) ? (schema[key].$get) : function(){},
                        $set: (schema[key].$set !== undefined) ? (schema[key].$set) : function(){},
                        $load: (schema[key].$load !== undefined) ? (schema[key].$load) : function(){},
                        $store: (schema[key].$store !== undefined) ? (schema[key].$store) : function(){},
                        $default: (schema[key].$default !== undefined) ? (schema[key].$default) : null
                    }
                } else {
                    internalValue = __buildInternalSchema(schema[key])
                }
            })(key)
            
            internalSchema[key] = internalValue
            
        }
        
        return internalSchema
    }
    
    internalSchema = __buildInternalSchema(schema)
    
    FerretModel.findOne = function(query) {
        var ee = new EventEmitter()
        
        ferret.findOne(name, query)
        .on('success', function(documentLoaded) {
            if (documentLoaded == null) {
                ee.emit('success', null)
                return
            }
            try {
                var model = new FerretModel(documentLoaded, { deserialize: true })
                process.nextTick(function() {
                    ee.emit('success', model)
                })
            } catch (err) {
                ee.emit('error', err)
            }
        })
        .on('error', function(err) {
            ee.emit('error', err)
        })
        
        return ee
    }
    
    FerretModel.find = function(query) {
        var ee = new EventEmitter()
        
        ferret.find(name, query)
        .on('cursor', function(cursor) {
            if (ee.listeners('each').length > 0) {
                cursor.each(function(err, documentLoaded) {
                    if (err) { ee.emit('error', err) }
                    else {
                        if (documentLoaded == null) {
                            ee.emit('each', null) 
                            return;
                        }
                        try {
                            var model = new FerretModel(documentLoaded, { deserialize: true })
                            process.nextTick(function(){
                                ee.emit('each', model) 
                            })
                        } catch (err) {
                            ee.emit('error', err)
                        }
                    }
                })
            } else {
                cursor.toArray(function(err, documentsLoaded) {
                    if (err) { ee.emit('error', err) }
                    else {
                        try {
                            for (var i = 0; i < documentsLoaded.length; i++) {
                                documentsLoaded[i] = new FerretModel(documentsLoaded[i], { deserialize: true })
                            }
                            ee.emit('success', documentsLoaded)
                        } catch (err) {
                            ee.emit('error', err)
                        }
                    }
                })
            }
        })
        .on('error', function(err) {
            ee.emit('error', err)
        })
        
        return ee
    }
    
    FerretModel.deserialize = function(value) {
        return new FerretModel(value, { deserialize: true })
    }
    
    FerretModel.prototype.toJSON = 
    FerretModel.prototype.serialize = function() {
        __buildDocumentToSave = function(internalSchema, internalDocument) {
            var documentToSave = { _id: internalDocument._id }
            
            for (var key in internalSchema) {
                var valueToSave
                if (internalSchema[key].$store) {
                    valueToSave = internalSchema[key].$store(internalDocument[key])
                    if (valueToSave === undefined) {
                        valueToSave = internalDocument[key]
                    }
                } else {
                    valueToSave = __buildDocumentToSave(internalSchema[key], internalDocument[key])
                }
                
                documentToSave[key] = valueToSave
            }
                        
            return documentToSave
        }
        
        return __buildDocumentToSave(internalSchema, this._internalDocument)
    }
        
    FerretModel.prototype.save = function() {
        var ee = new EventEmitter()
        var documentToSave = {}
        var self = this
        
        documentToSave = this.serialize()
        
        ferret.save(name, documentToSave)
        .on('success', function(savedDocument){
            self._internalDocument._id = savedDocument._id
            ee.emit('success', self)
        })
        .on('error', function(err){   
            ee.emit('error', err)
        })
        
        return ee
    }
    
    FerretModel.prototype.remove = function() {
        var ee = new EventEmitter()
        
        ferret.remove(name, { _id: this._id })
        .on('success', function(count) {
            ee.emit('success', count)
        })
        .on('error', function(err) {
            ee.emit('error', err)
        })
        
        return ee
    }
    
    return this._models[name] = FerretModel
}

}
