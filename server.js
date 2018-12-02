var express = require('express');
var session = require('cookie-session');
var bodyParser = require('body-parser');
var app = express();
var MongoClient = require('mongodb').MongoClient;
var assert = require('assert');
var ObjectId = require('mongodb').ObjectID;
var http = require('http');
var url  = require('url');
var fs = require('fs');
var formidable = require('formidable');

var mongourl = 'mongodb://381mpj:381mpj@ds151402.mlab.com:51402/comps381f';

app.set('view engine','ejs');

var SECRETKEY1 = 'I want to pass COMPS381F';
var SECRETKEY2 = 'Keep this to yourself';

var users = new Array(
    {userid: 'developer', password: 'developer'},
    {userid: 'guest', password: 'guest'}
);

app.set('view engine','ejs');

app.use(session({
    name: 'session',
    keys: [SECRETKEY1,SECRETKEY2]
}));
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use(express.static('public'));
// app.use(express.bodyParser());


app.get('/',function(req,res) {
    checkSession(req,res);
    // if (!req.session.authenticated) {
    //     console.log("Index, Failed");
    //     res.redirect('/login');
    // } else {
        MongoClient.connect(mongourl, function(err, db) {
            assert.equal(err,null);
            findRestaurants(db,{},20,function(restaurants) {
                db.close();
                console.log('Disconnected MongoDB\n');
                res.status(200);
                res.render('index',{restaurants:restaurants});
            });
        });
    //}
});

app.get('/display',function(req,res) {
    checkSession(req,res);
    var parsedURL = url.parse(req.url,true); //true to get query as object
    var queryAsObject = parsedURL.query;
    var backToIndex = (queryAsObject.backToIndex===null||queryAsObject.backToIndex===undefined)?false:true;
    MongoClient.connect(mongourl, function(err, db) {
        assert.equal(err,null);
        console.log('Connected to MongoDB\n');
        db.collection('restaurants').
        findOne({_id: ObjectId(queryAsObject._id)},function(err,doc) {
            assert.equal(err,null);
            console.log(req.session.userid);
            checkRated(db,queryAsObject._id,req.session.userid,function(callback){
                db.close();
                if(callback!==false){
                    console.log("Score: "+callback.grades[0].score);
                    console.log('Disconnected from MongoDB\n');
                    res.render('display',{restaurant:doc,user:req.session.userid,rated:true,score:callback.grades[0].score,backToIndex:backToIndex});
                }else{
                    console.log("Not rated");
                    res.render('display',{restaurant:doc,user:req.session.userid,rated:false,score:false,backToIndex:backToIndex});
                }
            });
        });
    });
});

app.get('/filtering',function(req,res) {
    checkSession(req,res);
    res.sendFile(__dirname + '/public/filtering.html');
});

app.post('/filtering',function(req,res) {
    var criteria={};
    console.log(req.body);
    for(key in req.body){
        if(req.body[key]!==''){
            switch(key){
                case "street": case "building": case "zipcode":
                    criteria['address.'+key] = new RegExp(req.body[key]);
                    console.log(criteria['address.'+key]);
                    break;
                default:
                    criteria[key] =  new RegExp(req.body[key]);
                    console.log(criteria[key]);
            }
        }
    }
    console.log('About to search: ' + JSON.stringify(criteria));

    MongoClient.connect(mongourl, function(err, db) {
        assert.equal(err,null);
        findRestaurants(db,criteria,null,function(restaurants) {
            db.close();
            console.log('Disconnected MongoDB\n');
            res.status(200);
            res.render('index',{restaurants:restaurants});
        });
    });
});

app.get('/edit',function(req,res) {
    checkSession(req,res);
    var parsedURL = url.parse(req.url,true); //true to get query as object
    var queryAsObject = parsedURL.query;
    if(queryAsObject.creator !== req.session.userid){
        alert("You are not allowed to edit this restaurant!");
        res.redirect("/");
    }
    var resObj = {
        _id: (queryAsObject._id===null?"":queryAsObject._id),
        building:(queryAsObject.building===null?"":queryAsObject.building),
        street:(queryAsObject.street===null?"":queryAsObject.street),
        zipcode:(queryAsObject.zipcode===null?"":queryAsObject.zipcode),
        name: queryAsObject.name,
        borough: queryAsObject.borough,
        cuisine: queryAsObject.cuisine,
        coord : [queryAsObject.lat,queryAsObject.lng]
    };
    res.render('edit',{restaurant:resObj});
});

app.post('/edit',function(req,res) {
    MongoClient.connect(mongourl,function(err,db) {
        assert.equal(err,null);
        console.log('Connected to MongoDB\n');
        var criteria = {};
        criteria['_id'] = ObjectId(req.body._id);
        var new_r = {
            address: {
                building:(req.body.building===null?"":req.body.building),
                street:(req.body.street===null?"":req.body.street),
                zipcode:(req.body.zipcode===null?"":req.body.zipcode),
                coord:[req.body.lat,req.body.lng]
            },
            name: req.body.name,
            borough: req.body.borough,
            cuisine: req.body.cuisine
        };
        console.log('Preparing update: ' + JSON.stringify(new_r));
        updateRestaurant(db,criteria,new_r,function(result) {
            db.close();
            res.redirect('/display?_id='+req.body._id+'&backToIndex=true');

        });
    });
});

app.post('/delete',function(req,res) {
    var criteria = {
        _id : ObjectId(req.body._id)
    };
    console.log('About to delete ' + JSON.stringify(criteria));
    MongoClient.connect(mongourl,function(err,db) {
        assert.equal(err,null);
        console.log('Connected to MongoDB\n');
        deleteRestaurant(db,criteria,function(result) {
            db.close();
            console.log("Deleted");
            res.redirect("/");
        });
    });
});

app.post('/rate',function(req,res) {
    var criteria = {
        _id : ObjectId(req.body._id)
    };
    console.log('About to delete ' + JSON.stringify(criteria));
    MongoClient.connect(mongourl,function(err,db) {
        assert.equal(err,null);
        db.collection('restaurants').update(
            { _id: ObjectId(req.body._id) },
            { $push:
                { grades:
                    {
                        userid:req.session.userid,
                        score:req.body.score
                    }
                }
            },function(err,result) {
                assert.equal(err, null);
                console.log("Rated");
                res.redirect('/display?_id='+req.body._id+'&backToIndex=true');
            }

        )
    });
});

app.get('/login',function(req,res) {
    res.sendFile(__dirname + '/public/login.html');
});

app.post('/login',function(req,res) {
    // for (var i=0; i<users.length; i++) {
    //     if (users[i].userid == req.body.userid &&
    //         users[i].password == req.body.password) {
    //         req.session.authenticated = true;
    //         req.session.userid = users[i].userid;
    //     }
    // }
    MongoClient.connect(mongourl, function(err, db) {
        assert.equal(err,null);
        verifyUser(db,{"userid":req.body.userid,"password":req.body.password},function(result) {
            db.close();
            console.log('Disconnected MongoDB\n');
            if(result===true){
                req.session.authenticated = true;
                req.session.userid = req.body.userid;
			}
            res.redirect('/');
        });
    });
});

app.get('/register',function(req,res) {
    res.sendFile(__dirname + '/public/register.html');
});

app.post('/register',function(req,res) {
    MongoClient.connect(mongourl, function(err, db) {
        assert.equal(err,null);
        userRegister(db,req.body.userid,req.body.password,function(result) {
            db.close();
            console.log('Disconnected MongoDB\n');
            res.redirect('/');
        });
    });
});

app.get('/create',function(req,res) {
    checkSession(req,res);
    var creator = req.session.userid;
    res.render('create',{creator:creator});
});

app.post('/create',function(req,res) {
    var dataArray = {};
    var address = {};
    var new_r = {};
    var form = new formidable.IncomingForm();
    form.parse(req, function (err, fields, files) {
        console.log(JSON.stringify(files));
        dataArray['creator'] = fields.creator;
        dataArray['name'] = fields.name;
        dataArray['borough'] = fields.borough;
        dataArray['cuisine'] = fields.cuisine;
        dataArray['street'] = fields.street;
        dataArray['building'] = fields.building;
        dataArray['zipcode'] = fields.zipcode;
        dataArray['coord'] = [parseFloat(fields.lat),parseFloat(fields.lng)];
        var filename = files.filetoupload.path;
        var mimetype = files.filetoupload.type;
        if(files.filetoupload!==undefined){
            console.log("ReadFile");
            fs.readFile(filename, function(err,data) {
                dataArray['mimetype'] = mimetype;
                dataArray['image'] = new Buffer(data).toString('base64');
                for(key in dataArray){
                    if(dataArray[key]!==''){
                        switch(key){
                            case "street": case "building": case "zipcode": case "coord":
                            address[key] = dataArray[key];
                            break;
                            default:
                                new_r[key] = dataArray[key];
                        }
                    }
                }
                if (address!==null&&address!=={}) {
                    new_r['address'] = address;
                }
                console.log('About to insert: ' + JSON.stringify(new_r));

                MongoClient.connect(mongourl,function(err,db) {
                    assert.equal(err,null);
                    console.log('Connected to MongoDB\n');
                    insertRestaurant(db,new_r,function(id) {
                        db.close();
                        res.redirect('/display?_id='+id+'&backToIndex=true');
                    });
                });
            })
        }else{
            for(key in dataArray){
                if(dataArray[key]!==''){
                    switch(key){
                        case "street": case "building": case "zipcode": case "coord":
                        address[key] = dataArray[key];
                        break;
                        default:
                            new_r[key] = dataArray[key];
                    }
                }
            }
            if (address!==null&&address!=={}) {
                new_r['address'] = address;
            }
            console.log('About to insert: ' + JSON.stringify(new_r));

            MongoClient.connect(mongourl,function(err,db) {
                assert.equal(err,null);
                console.log('Connected to MongoDB\n');
                insertRestaurant(db,new_r,function(id) {
                    db.close();
                    res.redirect('/display?_id='+id);
                });
            });
        }


    });
});

app.get('/logout',function(req,res) {
    req.session = null;
    res.redirect('/');
});

app.post('/api/restaurant/create',function(req,res){
    var inObj = req.body;
    var resObj;
    MongoClient.connect(mongourl,function(err,db) {
        assert.equal(err,null);
        console.log('Connected to MongoDB\n');
        insertRestaurant(db,inObj,function(id) {
            db.close();
            if(id!==undefined||id!==null){
                resObj = {
                    status : "ok",
                    _id: id
                };
                res.end(JSON.stringify(resObj));
            }else{
                resObj = {
                    status : "failed"
                };
                res.end(JSON.stringify(resObj));
            }
        });
    });
});

app.get('/api/restaurant/read/:criteria/:criValue',function(req,res){
    var criStr = req.params.criteria;
    var criValue = req.params.criValue;
    var criObj;
    switch(criStr){
        case "name":
            criObj = {"name":criValue};
            break;
        case "borough":
            criObj = {"borough":criValue};
            break;
        case "cuisine":
            criObj = {"cuisine":criValue};
            break;
        default:
            res.end("Invalid request");
    }
    MongoClient.connect(mongourl, function(err, db) {
        assert.equal(err,null);
        findRestaurants(db,criObj,null,function(restaurants) {
            db.close();
            console.log('Disconnected MongoDB\n');
            res.writeHead(200, {"Content-Type": "text/json"});
            res.end(JSON.stringify(restaurants,null,4));
        });
    });
});

app.listen(process.env.PORT || 8099);

function findRestaurants(db,criteria,limit,callback) {
    console.log("Finding Restaurant");
    var restaurants = [];
    if(limit!==null){
        cursor = db.collection('restaurants').find(criteria).limit(limit);
    }else{
        cursor = db.collection('restaurants').find(criteria);
    }
    cursor.each(function(err, doc) {
        assert.equal(err, null);
        if (doc != null) {
            restaurants.push(doc);
        } else {
            callback(restaurants);
        }
    });
}

function verifyUser(db,criteria,callback) {
    console.log("Verifying");
    user = db.collection('users').findOne(criteria,{userid:1});

    if(user) {
        console.log("Passed");
        callback(true);
    }else{
        console.log("Failed");
        callback(false);
    }
}

function userRegister(db,userid,password,callback) {
    console.log("Creating new user");
    user = db.collection('users').findOne({userid:userid},{userid:1});

    if(!user) {
        db.collection('users').insert(
            {
                userid: userid,
                password: password
            }, function(err, result) {
                assert.equal(err, null);
                console.log("Inserted a user into the users collection.");
                callback(true);
            }
        )
    }else{
        console.log("Cannot create a new user.");
        callback(false);
    }
}

function checkSession(req,res){
    if (!req.session.authenticated) {
        console.log("Index, Failed");
        res.redirect('/login');
    }
}

function insertRestaurant(db,r,callback) {
    db.collection('restaurants').insertOne(r,function(err,result) {
        assert.equal(err,null);
        callback(r._id);
    });
}

function updateRestaurant(db,criteria,newValues,callback) {
    db.collection('restaurants').updateOne(
        criteria,{$set: newValues},function(err,result) {
            assert.equal(err,null);
            console.log("update was successfully");
            callback(result);
        });
}

function deleteRestaurant(db,criteria,callback) {
    db.collection('restaurants').remove(criteria,function(err,result) {
        assert.equal(err,null);
        console.log("Delete was successfully");
        console.log(result);
        callback(result);
    });
}
function checkRated(db,objId,userId,callback) {
    db.collection('restaurants').findOne({
        "_id": ObjectId(objId),
        grades: {$elemMatch: {userid: userId}}
    },function(err, doc) {
        if (doc == null) {
            callback(false);
        } else {
            callback(doc);
        }
    });
}
