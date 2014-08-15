"use strict";

var express = require("express");
var util = require("util");
var sqlite3 = require("sqlite3");
var bodyParser = require("body-parser");
var io = require("socket.io").listen(process.env.WEBSOCKETS_PORT || 5001);
var crypto = require("crypto");
var fs = require("fs");

var db_exists = fs.existsSync("database.db");
var db = new sqlite3.Database("database.db");
if (!db_exists) db.exec(fs.readFileSync("setup.sql"));

var app = express();
app.use(bodyParser.json());

var parse_auth_token = function (token, callback) {
    if (!token) return -1;
    db.get("SELECT * FROM auth_token WHERE token_value = ?", [token],
        function (err, row) {
            if (!row) callback(-1);
            else callback(row.user_id);
        }
    );
}

var where_query = function (query, where, valid, success) {
    var params = [];
    var where_string = [];
    valid.forEach(function (key) {
        if (key in where) {
            params.push(where[key]);
            where_string.push(util.format("%s = ?", key));
        }
    });
    if (where_string.length) {
        query = util.format("%s WHERE %s", query, where_string.join(" AND "));
    }
    db.all(query, params, function (err, rows) {
        if ("id" in where) rows = rows[0];
        success(err, rows);
    });
}

var sha256 = function (s) {
    var hash = crypto.createHash("sha256");
    hash.update(s, "ascii");
    return hash.digest("hex");
}

var error = function (text) {
    return {error : text};
}

app.param("id", function (req, res, next, id) {
    req.id_param = parseInt(id);
    next();
});

app.all('*', function(req, res, next) {
    res.header("Access-Control-Allow-Origin", "*");
    res.header(
        "Access-Control-Allow-Headers",
        "X-Requested-With, Content-Type"
    );
    next();
});

app.route("/user")
    .get(function (req, res, next) {
        where_query(
            "SELECT user_id id, username FROM user",
            req.query, ["id", "username"],
            function (err, rows) {
                res.json(rows);
                next();
            }
        );
    })
    .post(function (req, res, next) {
        if (req.body.username.match(/^[a-zA-Z][a-zA-Z0-9_-]+$/)) {
            db.run(
                "INSERT INTO user (username, password) VALUES (?, ?)",
                [req.body.username, sha256(req.body.password)],
                function (err) {
                    if (!err) {
                        var user = {
                            id : this.lastID,
                            username : req.body.username
                        }
                        res.json(user);
                        io.sockets.emit("post user", user);
                    }
                    next();
                }
            );
        } else {
            res.json(error("Invalid username."));
            next();
        }
    })
;

app.route("/user/:id")
    .get(function (req, res, next) {
        db.get(
            "SELECT user_id id, username FROM user WHERE user_id = ?",
            [req.id_param],
            function (err, row) {
                res.json(row);
                next();
            }
        );
    })
;

app.route("/channel")
    .get(function (req, res, next) {
        db.all(
            "SELECT channel_id id, title, description FROM channel",
            function (err, rows) {
                res.json(rows);
            }
        );
    })
;

app.route("/channel/:id")
    .get(function (req, res, next) {
        db.get(
            "SELECT channel_id id, title, decription FROM channel WHERE channel_id = ?",
            [req.id_param],
            function (err, row) {
                res.json(row);
            }
        );
    })
;

app.route("/message")
    .get(function (req, res, next) {
        //parse_auth_token(req.query.auth, function (user_id) {
        where_query(
            "SELECT message_id id, user_id, channel_id, message_text, time FROM message",
            req.query, ["id", "user_id", "channel_id", "time"],
            function (err, rows) {
                res.json(rows);
                next();
            }
        );
    })
    .post(function (req, res, next) {
        console.log(req.body);
        parse_auth_token(req.query.auth, function (user_id) {
            if (user_id > -1 && req.body.message_text) {
                var time = Date.now();
                db.run(
                    "INSERT INTO message (user_id, channel_id, message_text, time) VALUES (?, ?, ?, ?)",
                    [
                        user_id, req.body.channel_id,
                        req.body.message_text, time
                    ],
                    function (err) {
                        if (!err) {
                            var message = {
                                id : this.lastID,
                                channel_id : req.body.channel_id,
                                user_id : user_id,
                                message_body : req.body.message_text,
                                time : time
                            };
                            res.json(message);
                            io.sockets.emit("post message", message);
                        } else {
                            res.json(error(err));
                        }
                        next();
                    }
                );
            } else {
                res.json(error("Please pass an auth token."));
                next();
            }
        });
    })
;

app.route("/message/:id")
    .get(function (req, res, next) {
        db.get(
            "SELECT message_id id, user_id, channel_id, message_text, time FROM message WHERE message_id = ?",
            [req.id_param],
            function (err, row) {
                res.json(row);
                next();
            }
        );
    })
;

app.route("/auth")
    .post(function (req, res, next) {
        var token_hash = sha256(Math.random().toString());
        db.get(
            "SELECT * FROM user WHERE username = ? AND password = ?",
            [req.body.username, sha256(req.body.password)],
            function (err, row) {
                if (row) {
                    db.run(
                        "INSERT INTO auth_token (user_id, token_value, creation_time, ip_address) VALUES (?, ?, ?, ?)",
                        [row.user_id, token_hash, Date.now(), req.ip],
                        function (err) {
                            if (!err) {
                                res.json({
                                    user_id : row.user_id,
                                    token_value : token_hash
                                });
                            }
                            next();
                        }
                    );
                } else {
                    res.json(error("Invalid details."));
                    next();
                }
            }
        );

    })
;

var people_in_channel = {}; // {<channel_id> : [user_id]}
//var user_in_channel = {}; // {<user_id> : <channel_id>}

var change_channel = function (user_id, old_channel, new_channel) {
    if (old_channel !== null) {
        if (!(old_channel in people_in_channel)) {
            people_in_channel[old_channel] = [];
        }
        var position = people_in_channel[old_channel].indexOf(user_id);
        if (position > -1) people_in_channel[old_channel].splice(position, 1);

        io.sockets.emit("channel movement", {
            channel_id : old_channel,
            users : people_in_channel[old_channel]
        });
    }
    if (new_channel !== null) {
        if (!(new_channel in people_in_channel)) {
            people_in_channel[new_channel] = [];
        }
        people_in_channel[new_channel].push(user_id);
        io.sockets.emit("channel movement", {
            channel_id : new_channel,
            users : people_in_channel[new_channel]
        });
    }
    console.log(
        util.format("%d: %d -> %d", user_id, old_channel, new_channel)
    );
}

io.on('connection', function (socket) {
    //io.emit('connected');
    socket.on("identify", function (auth_token) {
        parse_auth_token(auth_token, function (user_id) {
            if (user_id > -1) {
                var current_channel = null;
                var is_typing = true;
                socket.emit("identified");
                console.log(user_id + " identified");
                
                socket.on("change channel", function (channel) {
                    change_channel(user_id, current_channel, channel.id);
                    current_channel = channel.id;
                });

                socket.on("start typing", function (channel) {
                    channel.user_id = user_id;
                    is_typing = true;
                    io.sockets.emit("start typing", channel);
                });
                socket.on("stop typing", function (channel) {
                    channel.user_id = user_id;
                    is_typing = false;
                    io.sockets.emit("stop typing", channel);
                });
                
                socket.on("unidentify", function () {
                    socket.removeAllListeners("change channel");
                    socket.removeAllListeners("disconnect");
                    change_channel(user_id, current_channel, null);
                    if (is_typing) {
                        is_typing = false;
                        io.sockets.emit("stop typing", {
                            channel_id : current_channel,
                            user_id : user_id
                        });
                    }
                    console.log("unidentify " + user_id);
                    current_channel = null;
                });
                socket.on('disconnect', function () {
                    console.log("disconnect" + user_id);
                    change_channel(user_id, current_channel, null);
                    if (is_typing) {
                        io.sockets.emit("stop typing", {
                            channel_id : current_channel,
                            user_id : user_id
                        });
                    }
                });
            } else {
                socket.emit("identity failure");
            }
        });
    });
});

io.sockets.emit("refresh page");


var port = process.env.PORT || 5000;
app.listen(port);
console.log(util.format("Now listening on port %d.", port));