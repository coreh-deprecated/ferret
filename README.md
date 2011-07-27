ferret.js - Adorable mongodb library for node.js
=================================================

What is ferret.js?
------------------

`ferret.js` is a minimalistic wrapper around the excelent `node-mongodb-native` driver. It's easy to use and pretty small (the core module is around 300 lines of code, without comments). Ferret's design is centered on:

1. Simplicity
2. Proper Error Handling and Recovery
3. Orthogonality
4. Sensible defaults
5. Use of common idioms

License
-------

Ferret is distributed under a MIT license. See the LICENSE file for more information.

Installation
============

`ferret.js` can be easily installed through NPM:

    npm install ferret

Usage
=====

    var ferret = require('ferret')

Sample Application/Quick Guide
==============================

### Hello World
    
    ferret.find('users')
    .on('each', function(user) {
        console.log(user);
    })
    
This is arguably the simplest working program you can write using `ferret.js`.

The code above fetches all the documents from the collection named `users`, and prints their contents. 

The `find` function returns an `util.EventEmitter` instance, to which you can attach event listeners. `each` is a convenience event that is fired for each result found.

### 'each' versus 'success'

If you want to you can bind to `success` instead of `each` to get an array with all the results:

    ferret.find('users')
    .on('success', function(users) {
        for (var i = 0; i < users.length; i++) {
            console.log(users[i]);
        }    
    })


### Error Handling

It's probably a good idea to add some error handling to the code. This can be done by attaching a listener to the `error` event (Notice that the `on` calls are chainable):

    ferret.find('users')
    .on('success', function(users) {
        for (var i = 0; i < users.length; i++) {
            console.log(users[i]);
        }
    })
    .on('error', function(err) {
        // Do something about it
    })

### Server, Port, Database

You should have noticed that we did not specify ferret which server, port or database to use. 

If nothing is specified, it will default to database `test` on server `127.0.0.1`, port `27017` — mongodb's default. To manually specify what you want, use the `connect` method.

    ferret.connect('test', '127.0.0.1', '27017')
    
    ferret.find('users')
    .on('success', function(users) {
        
        for (var i = 0; i < users.length; i++) {
            console.log(users[i]);
        }
        
    })
    .on('error', function(err) {
        // Do something about it
    })
    
### The shared instance

On the first time you call `connect`, ferret will create a shared instance. It  can later be accessed by using `ferret.shared()`.

`ferret.find` is actually a shorthand to `ferret.shared().find`.

### Working with multiple ferret instances

If you're going to use multiple databases, you can store the return value of `ferret.connect` into a variable:

    var someDatabase = ferret.connect('test', '127.0.0.1', '27017')
    var otherDatabase = ferret.connect('blah', '127.0.0.1', '27017')
    
    someDatabase.find('users')
    .on('success', function(users) {
        
        for (var i = 0; i < users.length; i++) {
            console.log(users[i]);
        }
        
    })
    .on('error', function(err) {
        // Do something about it
    })

### Collections

Previously, we specified the collection to operate on through the first argument given to `find`.

If you want to, you can use the `collection` method to specify a collection to operate on.

Notice that `find` will no longer need or take a collection name as an argument:

    var someDatabase = ferret.connect('test', '127.0.0.1', '27017')

    var users = someDatabase.collection('users')
    
    users.find()
    .on('success', function(users) {
        
        for (var i = 0; i < users.length; i++) {
            console.log(users[i]);
        }
        
    })
    .on('error', function(err) {
        // Do something about it
    })


### Query buffering and the 'ready' event

You might have noticed that `connect` will return right away, and that we don't wait until the connection is estabilished to perform queries. 

Ferret will buffer the queries performed and wait until it connects to the server for the first time. If the connection is lost after that, ferret will no longer buffer queries, but instead report errors normally.

It's really not necessary, but if you *really* want to, you can wait until the connection is estabilished by listening to the 'ready' event:

    var database = ferret.connect('test', '127.0.0.1', '27017')
    
    database.on('ready', function(){
        
        var users = database.collection('users')

        users.find()
        .on('success', function(users) {
            
            for (var i = 0; i < users.length; i++) {
                console.log(users[i]);
            }
            
        })
        .on('error', function(err) {
            // Do something about it
        })
        
    })
    .on('error', function(){
        // Could not connect to mongodb
    })
    
### Models

Since version 0.2, ferret supports modelling:

    var User = ferret.model('user', {
        name: String,
        age: Number,
        email: {
            $set: function(value) {
                // validate email address
            }
        }
    })
    
    User.findOne({ name: 'John' })
    .on('success', function(user) {
        // Happy birthday!
        user.age++
        
        user.save()
        .on('error', function(err) {
            // Do something about it too
        })
    })
    .on('error', function(err) {
        // Do something about it
    })


Design goals
------------
`ferret.js` was designed with the following goals in mind:

1. **Simplicity** - Less code means less bugs, which is great. But simplicity is more than that: It means doing things the "obvious" way sometimes. "Clever" code is usually hard to understand, and less flexible.

2. **Proper Error Handling and Recovery** - Hiding complexity is not the same as hiding the reality. `ferret.js` will attempt to automatically reconnect to mongodb in case of failure. However, it will also notify you about the operations that may fail in the mean time, so you can take the appropriate actions.

3. **Orthogonality** - The same operations are provided on a consistent manner when accessing the database through different means. Ferret currently allows for access through:

    * a shared connection object
    * manually instanced connections
    * `FerretCollection` objects
    * `FerretModel` objects (subset of other APIs)

4. **Sensible defaults** - `ferret.js` comes with sensible defaults built in so that you can get to your application logic up as quickly as possible. If you need a more tailored behavior, you can easily configure things later.

5. **Use of Common idioms** - `ferret.js` sticks to the conventions of mongodb and of the `node-mongodb-native` driver as closely as possible, so you can easily make use of existing tutorials and documentation.


Instance State
--------------

Each ferret instance is actually a state machine described by the following state diagram:                          

                                 |
                                 V      
                           +-----------+
                           |   start   |
                           +-----------+   
                            /          \    
                           /            \                
                          /              \    
                         /                \    
                        V                  V
       ++======================++  ++=============++
       ||             |        ||  ||    error    ||
       ||             V        ||  ++=============++
       ||    +-----------+     ||
       ||    | connected |     ||
       ||    +-----------+     ||
       ||      |        Λ      ||       
       ||      V        |      ||
       ||   +--------------+   ||
       ||   | disconnected |   ||
       ||   +--------------+   ||
       ||                      ||
       ||                      ||      
       ++======================++                   
                ready                     

`ready` and `error` are both final states. `connected` and `disconnected` are sub-states of `ready`.

The current state of an instance can be queried by the `Ferret#state()` method. The possible return values are:

    'start'
    'error'
    'ready+connected'
    'ready+disconnected'

Ferret will only buffer queries in when in the `start` state.

Query Events
------------

All queries return a new `EventEmitter` instance, which will later emit a `success` or `error` event, depending on the result.

For convenience, the `find` query can also emit `each` and `cursor` events. `each` will iterate through the results, and `cursor` will provide you a raw `node-mongodb-native` cursor.

You should not listen to both `each` and `success` at the same time, as that will not work. The same warning is also valid for `cursor` and `success`.

Instance Events
---------------

`Ferret` inherits `EventEmitter`, and currently emits the following events:

    'ready'
    'error'
    'reconnect'
    'disconnect'
    
API
---

This section provides a quick overview of the ferret API. For detailed descriptons of the different commands mongodb provides, please check their documentation.

### Ferret Instance

*   **Ferret#state()** - Returns the instance's current state
*   **Ferret#find(collection_name[, query[, fields[, options]]])** - Find documents
*   **Ferret#findOne(collection_name, query)** - Find the first document
*   **Ferret#insert(collection_name, docs)** - Inserts one or more documents
*   **Ferret#save(collection_name, doc)** - Inserts if new, updates if existing
*   **Ferret#update(collection_name, criteria, replacement[, options])** - Updates existing documents
*   **Ferret#remove(collection_name, criteria)** - Removes existing documents
*   **Ferret#collection(name)** - Retuns a `FerretCollection` object
*   **Ferret#model(schema)** - Create a new model

`Ferret` inherits `EventEmitter`, so it also provides all functions the latter provides.

### Ferret Module

*   **Ferret.connect([database_name[, host[, port]]])** - Creates a new ferret instance
*   **Ferret.shared(ferret)** - Gets (or sets, if `ferret` is specified) the shared instance

For convenience, all the functions provided by `Ferret` instances are also available at the ferret module. When called, these functios will affect the shared instance.

### FerretCollection

`FerretCollection` objects can be obtained through the `Ferret#collection` method. They provide many of the methods the ferret instance provides, minus the `collection_name` parameter:

*   **FerretCollection#find([query[, fields[, options]]])** - Find documents
*   **FerretCollection#findOne(query)** - Find the first document
*   **FerretCollection#insert(docs)** - Inserts one or more documents
*   **FerretCollection#save(doc)** - Inserts if new, updates if existing
*   **FerretCollection#update(criteria, replacement[, options])** - Updates existing documents
*   **FerretCollection#remove(criteria)** - Removes existing documents

### FerretModel

Constructors for `FerretModel` objects can be obtained through the `Ferret#model` method. `FerretModel` provides basic modelling functionality, so you can access data on a more object oriented fashion if you want to.

The API is similar to `Ferret` and `FerretCollection`, but more limited.


#### Static methods

*   **new FerretModel([data[, options]])** - Create a new model instance
*   **FerretModel#find([query])** - Find documents and wrap them in models
*   **FerretModel#findOne(query)** - Find the first document and wrap it in a model
*   **FerretModel#deserialize(data)** - Create a model from serialized data. Same as `new FerretModel(data, { deserialize: true })`.

#### Instance methods

*   **FerretModel#save()** - Persist the model back into the database
*   **FerretModel#remove()** - Delete the object from the database
*   **FerretModel#serialize()** - Convert the model to a format ready for storage
*   **FerretModel#toJSON()** - Same as `FerretModel#serialize`

FAQ
---

### Why ferret?

Mongoose was already taken ;-)

### Does ferret provide ORM/Modelling functionality?

Yep. With the release of version 0.2.0, ferret now provides models.