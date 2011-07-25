var ferret = require('./ferret')

var currentTest = -1
var start, next, tests, numErrors = 0;
start = next = function(err, shouldStop) {
    if (err) {
        console.error( 'Test #' + currentTest + ' failed: ' )
        console.error( err.stack.toString() )
        numErrors++
    }
    if ((++currentTest < tests.length) && !shouldStop) {
        process.nextTick(function() {
            try {
                tests[currentTest]()
            } catch (err) {
                console.error("Catched exception.")
                next(err)
            }
        })
    } else {
        process.nextTick(function() {
            console.log('Ran ' + currentTest + ' tests: ' + (currentTest - numErrors) + ' passed, ' + numErrors + ' failed.')
            process.exit(numErrors)
        })
    }
}
tests = [
    function() {
        if (ferret.state() != 'start') {
            next(new Error('ferret should be in \'start\' state'))
        } else {
            next();
        }
    },
    function() {
        var triggered = false;
        ferret.on('ready', function(){
            triggered = true;
        })
        ferret.save('users', { name: 'John Doe', age: 20, sex: 'M' })
        .on('success', function() {
            if (!triggered) {
                next(new Error('ferret should have trigerred \'ready\' event'))
            } else if (ferret.state() != 'ready+connected') {
                next(new Error('ferret should be in \'ready+connected\' state'))
            } else {
                next()
            }
        })
        .on('error', function(err) {
            next(err, true)
            console.log('Hint: Is mongodb running? Mongodb needs to be running at localhost, port 27017 for this test to pass.')
        })
    },
    function() {
        ferret.find('users', { name: 'John Doe' })
        .on('success', function(users) {
            if (users instanceof Array) {
                next()
            } else {
                next(new Error('find did not provide an array on success'))
            }
        })
        .on('error', function(err) {
            next(err)
        })
    },
    function() {
        var otherDb = ferret.connect('test2')
        var widgets = otherDb.collection('widgets')
        widgets.find({})
        .on('success', function(w) {
            if (w instanceof Array) {
                next()
            } else {
                next(new Error('find did not provide an array on success'))
            }
        })
        .on('error', function(err) {
            next(err)
        })
    },
    function() {
        var triggered = false;
        ferret.on('disconnect', function() {
            triggered = true;
            if (ferret.state() != 'ready+disconnected') {
                next(new Error('State should be \'ready+disconnected\''))
            } else {
                next()
            }
        })
        console.log("Please stop mongod.")
        setTimeout(function() {
            if (!triggered) {
                next(new Error('Should have triggered a \'disconnect\' event'))
            }
        }, 15000)
    },
    function() {
        ferret.find("users", {})
        .on('success', function(users) { 
            next(new Error("Should have failed, since database is offline."))
        })
        .on('error', function() { 
            next()
        })
    },
    function() {
        var triggered = false;
        ferret.on('reconnect', function() {
            triggered = true;
            if (ferret.state() != 'ready+connected') {
                next(new Error('State should be \'ready+connected\''))
            } else {
                next()
            }
        })
        console.log("Please start mongod again.")
        setTimeout(function() {
            if (!triggered) {
                next(new Error('Should have triggered a \'reconnect\' event'))
            }
        }, 15000)
    },
    function() {
        var fakeDb = ferret.connect('test', '0.0.0.0', '100')
        fakeDb.on('ready', function(){
            next(new Error('Connection should have failed'))
        })
        fakeDb.on('error', function(err) {
            if (fakeDb.state() != 'error') {
                next(new Error('state should be \'error\''))
            } else {
                next()
            }
        })
    }
]

start()