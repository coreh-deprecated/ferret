var ferret

try {
    require('colors')
} catch (e) {
    Object.defineProperty(String.prototype, "red", { get: function() { return this } })
    Object.defineProperty(String.prototype, "green", { get: function() { return this } })
    Object.defineProperty(String.prototype, "yellow", { get: function() { return this } })
    Object.defineProperty(String.prototype, "blue", { get: function() { return this } })
}

var currentTest = -1
var start, next, tests, numErrors = 0, numSkips = 0, processErrors = 0, expectedSpecialErrors = 0, specialErrors = 0;
start = next = function(err, shouldStop, skipped) {
    if (currentTest >= 0) {
        if (err) {
            console.error( 'Test #' + currentTest + ' failed: '.red )
            console.error( err.stack.toString() )
            numErrors++
        } else {
            if (skipped) {
                numSkips++;
                console.log( 'Test #' + currentTest + ' skipped'.yellow)
            } else {
                console.log( 'Test #' + currentTest + ' passed'.green)    
            }
        }
    }
    if ((++currentTest < tests.length) && !shouldStop) {
        process.nextTick(function() {
            try {
                tests[currentTest]()
            } catch (err) {
                if (err != null) {
                    console.error("Catched exception.")
                    next(err)
                }
            }
        })
    } else {
        process.nextTick(function() {
            console.log('Ran ' + (currentTest - numSkips) + ' tests: ' + (currentTest - numErrors - numSkips) + ' passed, ' + numErrors + ' failed, '  + numSkips + ' skipped.')
            process.exit(numErrors)
        })
    }
}

var assert = function(exp) {
    if (!exp) {
        console.log('assertion: ' + new Error().stack.split('\n')[2].match(/\((.*)\)/)[1] + ' violated'.red)
        next(new Error('assertion violated'))
        throw null
    }
}

tests = [
    function() {
        ferret = require('./ferret')
        next()
    },
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
        if (process.argv[2] == '--skip-offline') {
            next(null, false, true);
            return;
        }
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
        if (process.argv[2] == '--skip-offline') {
            next(null, false, true);
            return;
        }
        ferret.find("users", {})
        .on('success', function(users) { 
            next(new Error("Should have failed, since database is offline."))
        })
        .on('error', function() { 
            next()
        })
    },
    function() {
        if (process.argv[2] == '--skip-offline') {
            next(null, false, true);
            return;
        }
        var fakeDb = ferret.connect()
        fakeDb.on('ready', function(){
            next(new Error('Connection should have failed'))
        })
        fakeDb.on('error', function(err) {
            if (fakeDb.state() != 'error') {
                next(new Error('state should be \'error\''))
            } else {
                fakeDb.find('widget', {})
                .on('success', function(widget) {
                    next(new Error('Should have failed, since we\'re not connected'))
                })
                .on('error', function(err){
                    next()
                })
                // Check if we're not queueing queries on error state
                assert(fakeDb._readyQueue.length === 0)
            }
        })
    },
    function() {
        if (process.argv[2] == '--skip-offline') {
            next(null, false, true);
            return;
        }
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
        var testModel = ferret.model('hello')
        if (testModel !== undefined) {
            next(new Error('model should return undefined if not defined')) 
        } else {
            next()
        }        
    },
    function() {
        var count = 0;
        var TestModel = ferret.model('hello', {
            name: String,
            age: Number,
            isProgrammer: Boolean,
            sex: {
                $set: function(value) {
                    count++
                    if (value != 'M' && value != 'F' && value != '?') {
                        throw new Error('invalid sex')
                    }
                },
                $load: function(value) {
                    count++
                    if (value != 'M' && value != 'F') {
                        value = '?'
                    }
                    return value;
                },
                $default: '?'
            },
            bar: {
                $get: function(value) {
                    count++
                    return value.replace(/foo/g, 'bar')
                },
                $default: 'foo'
            },
            dog: {
                name: String,
                age: {
                    $set: function(value) {
                        if (typeof value != 'number' && !(value instanceof Number)) {
                            throw new Error('age should be a number')
                        }
                    },
                    $store: function(value) {
                        return value * 7
                    },
                    $load: function(value) {
                        return value / 7
                    },
                    $default: NaN
                },
                isProgrammer: {
                    $get: function(value) {
                        // test getter without return
                        count++
                    },
                    $set: function(value) {
                        // test setter with return
                        count++
                        return false;
                    },
                    $default: false
                }
            }
        })
        if (!TestModel) {
            next(new Error('did not return a model'))
        } else if (TestModel !== ferret.model('hello')) {
            next(new Error('the model created previously and the model returned are not the same'))
        }
        var guy = new TestModel()
        assert(guy._id == undefined)
        assert(guy.name == '')
        assert(isNaN(guy.age))
        assert(guy.isProgrammer === false)
        assert(guy.sex == '?')
        assert(guy.bar == 'bar')
        assert(guy.dog.name == '')
        assert(isNaN(guy.dog.age))
        assert(guy.dog.isProgrammer === false)
        assert(count == 2)

        guy.name = 'John'
        assert(guy.name == 'John')
        guy.age = 20;
        assert(guy.age == 20)
        guy.sex = 'M'
        assert(guy.sex == 'M')
        assert(count == 3)
        guy.dog.name = 'Sparks'
        assert(guy.dog.name == 'Sparks')
        guy.dog.age = 3
        assert(guy.dog.age == 3)
        guy.dog.isProgrammer = true;
        assert(guy.dog.isProgrammer == false)
        
        var hasFailed = false;
        try {
            guy.sex = 'Invalid Value'
        } catch (e) {
            hasFailed = true;
        }
        assert(hasFailed)
        assert(guy.sex == 'M')
        guy.bar = 'foo foo foo';
        assert(guy.bar == 'bar bar bar')
        
        // $set test
        var gal = new TestModel({
            name: 'Jane',
            age: 18,
            sex: 'F',
            dog: {
                name: 'Ribs',
                age: 2,
                isProgrammer: true // Will be set to false by $set
            }
        })
        
        assert(gal._id == undefined)
        assert(gal.name == 'Jane')
        assert(gal.age === 18)
        assert(gal.sex == 'F')
        assert(gal.dog.name == 'Ribs')
        assert(gal.dog.age == 2)
        assert(gal.dog.isProgrammer == false)
        
        // $load test (deserialize)
        gal = new TestModel({
            _id: '123', // needed, since we're deserializing
            name: 'Jane',
            age: '18',
            sex: 'F',
            dog: {
                name: 'Ribs',
                age: 14, // in dog years
                isProgrammer: true // should work since there's no $load
            }
        }, { deserialize: true })
        
        assert(gal._id == '123')
        assert(gal.name == 'Jane')
        assert(gal.age === 18)
        assert(gal.sex == 'F')
        assert(gal.dog.name == 'Ribs')
        assert(gal.dog.age == 2)
        assert(gal.dog.isProgrammer == true) // behold the amazing programming dog
        
        var mistery = TestModel.deserialize({
            sex: 'unknown'  // should become '?'
        })
        
        assert(mistery.sex == '?')
        
        guy.save()
        .on('success', function(savedGuy) {
            assert(savedGuy === guy)
            assert(guy._id !== undefined)
            TestModel.findOne(guy._id)
            .on('success', function(loadedGuy){
                assert(loadedGuy !== undefined)
                assert(loadedGuy !== null)
                assert(loadedGuy instanceof TestModel)
                assert(loadedGuy.name == 'John')
                assert(loadedGuy.age == 20)
                assert(loadedGuy.sex == 'M')
                assert(loadedGuy.isProgrammer == false)
                assert(loadedGuy.dog.name == 'Sparks')
                assert(loadedGuy.dog.age == 3)
                assert(loadedGuy.dog.isProgrammer == false)
                assert(loadedGuy.bar == 'bar bar bar')
                next()
            })
            .on('error', function(err){
                next(err)
            })
        })
        .on('error', function(err) {
            next(err)
        })
    },
    function() {
        var TestModel = ferret.model('hello')
        var count = 0
        var error = null
        var hasBeenNull = false;
        
        TestModel.find({})
        .on('each', function(person) {
            if (person == null) {
                assert(hasBeenNull == false)
                hasBeenNull = true;
            } else {
                assert(hasBeenNull == false)
                assert(person instanceof TestModel)
                assert(person._id !== undefined)
                count++
            }
            expectedSpecialErrors++
            throw "special"
        })
        .on('error', function(err) {
            error = err
        })
        
        setTimeout(function() {
            assert(count > 0)
            assert(error == null)
            assert(hasBeenNull == true)

            next()
        }, 200)
    },
    function() {
        var TestModel = ferret.model('hello')
        var count = 0
        
        var test = new TestModel({
            name: 'Hello'
        })
        test.save()
        .on('success', function() {
            assert(test._id !== undefined)
            TestModel.find()
            .on('success', function(models) {
                assert(models instanceof Array)
                assert(models.length > 0)
                test.remove()
                .on('success', function(count) {
                    assert(typeof count == 'number')
                    assert(count == 1)
                    TestModel.find()
                    .on('success', function(moreModels) {
                        assert(moreModels.length == models.length - 1)
                        next()
                    })
                    .on('error', function(err) {
                        next(err)
                    })
                })
                .on('error', function(err) {
                    next(err)
                })
            })
            .on('error', function(err) {
                next(err)
            })
        })
        .on('error', function(err) {
            next(err)
        })
    },
    function() {
        var TestModel = ferret.model('hello')
        var total = null
        var count = 0
        var lastError = null
        TestModel.find()
        .on('success', function(results) {
            total = results.length;
            for (var i = 0; i < total; i++) {
                results[i].remove()
                .on('success', function() {
                    count++;
                })
                .on('error', function(err) {
                    lastError = err
                })
            }
        })
        .on('error', function(err) {
            next(err)
        })
        setTimeout(function(){
            assert(count == total)
            assert(lastError == null)
            next()
        }, 200)
    },
    function() {
        var TestModel = ferret.model('hello')
        TestModel.findOne({ name: 'test123' })
        .on('success', function(hello) {
            assert(hello == null)
            next()
            expectedSpecialErrors++
            throw "special"
        })
        .on('error', function(err) {
            next(err)
        })
    },
    function() {
        assert(processErrors == 0)
        next()
    },
    function() {
        assert(specialErrors == expectedSpecialErrors)
        next()
    }
]

process.on('uncaughtException', function(err){
    if (err == "special") {
        specialErrors++
    } else {
        processErrors++
        console.error(err)
    }
})

start()
