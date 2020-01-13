/* CONFIGURATION */
//10.12.2019
var OpenVidu = require('openvidu-node-client').OpenVidu;
var Session = require('openvidu-node-client').Session;
var OpenViduRole = require('openvidu-node-client').OpenViduRole;

// Check launch arguments: must receive openvidu-server URL and the secret
if (process.argv.length != 4) {
    console.log("Usage: node " + __filename + " OPENVIDU_URL OPENVIDU_SECRET");
    process.exit(-1);
}
// For demo purposes we ignore self-signed certificate
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

// Node imports
var express = require('express');
var app = express(); // Create our app with express
var cors = require('cors');
var kafka = require('kafka-node');
var axios=require("axios");
var rp = require("request-promise");
var fs = require('fs');
var btoa = require('btoa');
var session = require('express-session');
var https = require('https');
var bodyParser = require('body-parser'); // Pull information from HTML POST (express4)
var {
    promisify
} = require('util');
var getIP = promisify(require('external-ip')());
var sessionId;
var fullUrl;
// Server configuration
app.use(session({
    saveUninitialized: true,
    resave: false,
    secret: 'MY_SECRET'
}));
app.use(express.static(__dirname + '/public')); // Set the static files location
app.use(bodyParser.urlencoded({
    'extended': 'true'
})); // Parse application/x-www-form-urlencoded
app.use(bodyParser.json()); // Parse application/json
app.use(bodyParser.json({
    type: 'application/vnd.api+json'
}));
app.use(bodyParser.urlencoded({ // to support URL-encoded bodies
    extended: true
})); // Parse application/vnd.api+json as json
app.use(cors());
// Listen (start app with node server.js)
var options = {
    key: fs.readFileSync('openvidukey.pem'),
    cert: fs.readFileSync('openviducert.pem')
};


var server = https.createServer(options, app).listen(5000, function () {
    console.log('App running at 5000');
});

// Environment variable: URL where our OpenVidu server is listening
var OPENVIDU_URL = process.argv[2];
// Environment variable: secret shared with our OpenVidu server
var OPENVIDU_SECRET = process.argv[3];

// Entrypoint to OpenVidu Node Client SDK
var OV = new OpenVidu(OPENVIDU_URL, OPENVIDU_SECRET);

var properties = {
    recordingMode: "ALWAYS", //RecordingMode.ALWAYS, // RecordingMode.ALWAYS for automatic recording
    defaultOutputMode: "INDIVIDUAL" //Recording.OutputMode.INDIVIDUAL
};
// Collection to pair session names with OpenVidu Session objects
var mapSessionObject = {};
// Collection to pair session names with tokens
var mapSessionObjectToken = {};

/* CONFIGURATION */

// Mock database
var users = [{
        uid: "1",
        user: "publisher1",
        pass: "pass",
        ip: "192.168.185.177",
        role: OpenViduRole.PUBLISHER
    },
    {
        uid: "2",
        user: "publisher2",
        pass: "pass",
        ip: "172.24.130.112",
        role: OpenViduRole.PUBLISHER
    },
    {
        uid: "3",
        user: "publisher3",
        pass: "pass",
        ip: "172.24.130.XXX",
        role: OpenViduRole.PUBLISHER
    },
    {
        user: "subscriber1",
        pass: "pass",
        role: OpenViduRole.SUBSCRIBER
    },
    {
        user: "subscriber2",
        pass: "pass",
        role: OpenViduRole.SUBSCRIBER
    }
];



//KAFKA METHODS

var Producer = kafka.Producer,
    client = new kafka.KafkaClient(),
    producer = new Producer(client);

var Consumer = kafka.Consumer,
    consumer = new Consumer(client,
        [{
            topic: 'Streams',
            offset: 0
        }], {
            autoCommit: false
        }
    );


producer.on('error', function (err) {
    console.log('Producer is in error state');
    console.log(err);
});

consumer.on('message', function (message) {
    // console.log(message);vraticemo
});

consumer.on('error', function (err) {
    console.log('Error:', err);
});

consumer.on('offsetOutOfRange', function (err) {
    // console.log('offsetOutOfRange:', err); vraticemo
});


function sendFetchedSession() {
    var options = {

        url: `https://${OPENVIDU_URL}/api/sessions/${sessionId}`,

        method: "GET",

        resolveWithFullResponse: true,

        headers: {
            "Access-Control-Allow-Origin": "*",
            "Authorization": "Basic " + btoa("OPENVIDUAPP:MY_SECRET")
        }

    };

    getIP()
        .then((ip) => {
            console.log("This is external ip " + ip);
            fullUrl = `https://${ip}:${server.address().port}/#`;
            console.log(fullUrl);
            return rp(options);
        })
        .then(response => {
            bodyObject = JSON.parse(response.body);
            console.log("Body object original " + response.body);
            //  Making new object!!!   and send bodyObject1
            var bodyObject1 = {

                streamPath: `C:/Users/marko.petrovic/Desktop/connexions/public/recordings/${bodyObject.sessionId}`,
                sessionId: `${fullUrl}${bodyObject.sessionId}`,
                connectionId: bodyObject.connections.content[0].connectionId,
                createdAt: bodyObject.connections.content[0].createdAt,
                location: bodyObject.connections.content[0].location,
                platform: bodyObject.connections.content[0].platform,
                token: bodyObject.connections.content[0].token,

            };
            // console.log(Object.keys(bodyObject.connections.content[0]));
            bodyString = JSON.stringify(bodyObject1); 

            console.log("Body string for kafka  : " + bodyString);

            payloads = [{
                topic: "Streams",
                messages: bodyString,
                partition: 0
            }];
            producer.send(payloads, function (err, data) {
                if (err) {
                    console.log(err);
                }
                console.log("Kafka data " + JSON.stringify(data)); //will come back
                console.log("Done");
            });

        return postFiware(bodyObject1);
        })
        .then((value=>{console.log("postfiware executed, status code "+value.statusCode);})
        )
        .catch(error => {
            console.log("In catched error");
            console.log(error);
        });

}

function postFiware(bodyObject1) {
    return new Promise((resolve, reject) => {
        console.log("IN postfiware bodyobject "+JSON.stringify(bodyObject1));
        var options = {
            method: "POST",
            headers: {
                "Access-Control-Allow-Origin": "*",
                "Authorization": "Basic " + btoa("OPENVIDUAPP:MY_SECRET"),
                "options": "keyValues"
            },
            uri: "http://localhost:1026/v2/entities?options=keyValues",
            resolveWithFullResponse: true,
            json: true,
            body: {
                id: bodyObject1.connectionId,
                type: "Stream",
                sessionId: bodyObject1.sessionId,
                createdAt: bodyObject1.createdAt,
                location: bodyObject1.location,
                platform: bodyObject1.platform
            }
        };

        rp(options)
            .then((response) => {
                    // console.log("RESPONSE IZ FIWAREA " + JSON.stringify(response.body));
                    console.log("before resolving postFiware");
                    console.log(response.statusCode);
                    return resolve(response);
                }
            )
            .catch(error => {
                console.log(error.statusCode);
                return reject(error);
            });

    });
}

app.post('/api-sessions/sendSessionFromFront', function (req, res) {

    // Retrieve params from POST body
    sessionId = req.body.sessionId;
    console.log("Evo nam ga originalni session id  " + sessionId);
    res.status(200).send({
        sessionId: sessionId,
        message: "Evo odgovora iz backend-a sa session id-jem"
    });
    sendFetchedSession();
});




// Login
app.post('/api-login/login', function (req, res) {

    // Retrieve params from POST body
    var user = req.body.user;
    var pass = req.body.pass;
    var uid = req.body.uid;
    var role;
    var ip = req.body.ip;
    console.log("Logging in with  username, password ,ip}={" + user + ", " + pass + ip + "}");

    if (login(user, pass)) { // Correct user-pass
        role = OpenViduRole.SUBSCRIBER;
        // Validate session and return OK 
        // Value stored in req.session allows us to identify the user in future requests
        console.log(  user + " has logged in" + pass +" , "+ role);
        req.session.loggedUser = user;
        // role=req.session.loggedUser.role;
        res.status(200).send({
            user: user,
            message: "You have logged in successfully",
            role: role,
            pass: pass
        });
        // res.send();
    } else { 
        //THIS IS REPLACED
        // Wrong user-pass
        // Invalidate session and return error
        // console.log("'" + user + "' invalid credentials");
        // req.session.destroy();
        // res.status(401).send('User/Pass incorrect');  
        if (verifyPublisher(uid, ip)) {
            res.status(200).send({
                user: user,
                message: "You are streaming successfully",
                uid: uid,
                ip: ip
            });
            console.log(`this is role  ${role}`);
            console.log("this is logged ip " + ip);
        } else {
            res.status(400).send({
                message: "You are not authorized to publish"
            });
        }
    }
});


//Logout

// app.post('/api-login/logout', function (req, res) {
//     console.log("'" + req.session.loggedUser + "' has logged out");
//     req.session.destroy();
//     res.status(200).send();
// });  

// Get token (add new user to session)

app.post('/api-sessions/create-session', function (req, res) {


    var resSession = OV.createSession(properties);
    resSession.then((res) => {
        Session.getSessionId;
    });
    res.status(200).send(resSession);
});




// app.post('/api-sessions/get-token', function (req, res) {


//     // The video-call to connect
//     var roomId = req.body.roomId;
//     // Role associated to this user
//     var role;
//     if (role) {
//         role = users.find(u => (u.user === req.session.loggedUser)).role;
//     } else {
//         role = OpenViduRole.PUBLISHER;
//     }

//     // Optional data to be passed to other users when this user connects to the video-call
//     // In this case, a JSON with the value we stored in the req.session object on login
//     // var serverData = JSON.stringify({ serverData: req.session.loggedUser }); vraticemo

//     console.log("Getting a token | {roomId}={" + roomId + "}");
//     // Build tokenOptions object with the serverData and the role
//     var tokenOptions = {
//         // data: serverData,
//         role: role
//     };

//     if (mapSessionObject[roomId]) {
//         // Session already exists
//         console.log('Existing room ' + roomId);

//         // Get the existing Session from the collection
//         var mySession = mapSessionObject[roomId];
//         // console.log("Here is mySession "+util.inspect( mySession));
//         // Generate a new token asynchronously with the recently created tokenOptions
//         mySession.generateToken(tokenOptions)
//             .then(token => {

//                 // Store the new token in the collection of tokens
//                 mapSessionObjectToken[roomId].push(token);

//                 // Return the token to the client
//                 res.status(200).send({
//                     0: token
//                 });
//             })
//             .catch(error => {
//                 console.error(error);
//             });
//     } else {
//         // New session
//         console.log('New session ' + roomId);

//         // Create a new OpenVidu Session asynchronously
//         OV.createSession(properties)
//             .then(session => {
//                 // Store the new Session in the collection of Sessions
//                 mapSessionObject[roomId] = session;
//                 // Store a new empty array in the collection of tokens
//                 mapSessionObjectToken[roomId] = [];
//                 // console.log(util.inspect( session))
//                 // Generate a new token asynchronously with the recently created tokenOptions
//                 session.generateToken(tokenOptions)
//                     .then(token => {

//                         // Store the new token in the collection of tokens
//                         mapSessionObjectToken[roomId].push(token);

//                         // Return the Token to the client
//                         res.status(200).send({
//                             0: token
//                         });
//                     })
//                     .catch(error => {
//                         console.error(error);
//                     });
//             })
//             .catch(error => {
//                 console.error(error);
//             });
//     }

// });

// Remove user from session
app.post('/api-sessions/remove-user', function (req, res) {

    // Retrieve params from POST body
    var roomId = req.body.roomId;
    var token = req.body.token;
    console.log('Removing user with {roomId, token}={' + roomId + ', ' + token + '}');

    // If the session exists
    if (mapSessionObject[roomId] && mapSessionObjectToken[roomId]) {
        var tokens = mapSessionObjectToken[roomId];
        var index = tokens.indexOf(token);

        // If the token exists
        if (index !== -1) {
            // Token removed

            tokens.splice(index, 1);

            console.log(roomId + ': ' + tokens.toString());
        } else {
            var msg = 'Problems in the app server: the TOKEN wasn\'t valid';
            console.log(msg);
            res.status(500).send(msg);
        }
        if (tokens.length == 0) {
            // Last user left: session must be removed
            console.log("Room with id " + roomId + ' empty!');
            delete mapSessionObject[roomId];
        }
        res.status(200).send();
    } else {
        var msg = 'SESSION does not exist- no users there';
        console.log(msg);
        res.status(500).send(msg);
    }

});

/* REST API */



/* AUXILIARY METHODS */

function login(user, pass) {
    return (users.find(u => (u.user === user) && (u.pass === pass)));
}

function verifyPublisher(uid, ip) {
    return (users.find(u => (u.uid === uid) && (u.ip === ip)));
}

// function isLogged(session) {
//     return (session.loggedUser != null);
// }

// function getBasicAuth() {
//     return 'Basic ' + (new Buffer('OPENVIDUAPP:' + OPENVIDU_SECRET).toString('base64'));
// }

// function getFiware() {
//     request({
//         method: "GET",
//         headers: {
//             //           "Fiware-Service": "waste4think",
//             //           "Fiware-ServicePath": "/deusto/w4t/cascais/real",
//             //           "X-Auth-Token": "DevelopmentTest",
//             "Access-Control-Allow-Origin": "*",
//             "Authorization": "Basic " + btoa("OPENVIDUAPP:MY_SECRET")
//         },
//         uri: "http://127.0.0.1:1026/v2/entities",
//         json: true
//     },
//         function (error, response, body) {
//             console.log("RESPONSE IZ FIWAREA " + JSON.stringify(response));
//         }
//     )

// }

// async function getData() {
//     const result = await axios.get('https://dube.io/service/ping')
//     const data = result.headers;
    
//     console.log('data', data);
    
//     return data;
// }

// getData();