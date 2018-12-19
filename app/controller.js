﻿const express = require("express");
const session = require("express-session");
const multer = require("multer"); // parse multipart form
const uuidv4 = require("uuid/v4"); // generate post and img id
const fileType = require("file-type"); // determine image type
const moment = require("moment"); // get unix timestamp
const validator = require("validator"); // sanstize input
const csurf = require("csurf"); // express csrf protection middleware
const uuidRegEx = require('uuid-regexp')
const hbs = require("hbs");
const azurestor = require("../data/azurestor"); // azure storage service
const dao = require("../data/mongoose_dao"); // mongodb
const web_logging_setup = require("./web_logging").setupWebLog;

// initialize app
const app = express();
const upload = multer();
const csrfProtection = csurf({ cookie: false });
web_logging_setup(app);

// session support
app.use(session({
    secret: 'xxxxxxxxxxxxxxxxxxxxxxx',
    resave: false,
    saveUninitialized: false
}));

// static assets and hbs support
app.set("view engine", "hbs");
app.use(express.static(__dirname + "/../views/"));

// access the admin panel
app.get("/adminpanel", (req, res) => {
    if (req.session.user != null) { // authorized
        console.log(`authorized user: ${req.session.user}`);
        dao.getAllPosts((err, doc) => {
            if (err) {
                console.log(error);
                res.render("adminpanel", null);
            } else {
                res.render("adminpanel", {
                    posts: doc
                });
            }
        });
    } else { // unauthorized
        console.log(`unauthorized`);
        res.redirect("login");
    }
});

// new post page
app.get("/new", (req, res) => {
    if (req.session.user != null) { // authorized
        console.log(`authorized user: ${req.session.user}`);
        id = uuidv4();
        res.render("edit", {
            postid: id,
            author: req.session.user,
            action: "Add",
            dest: "/new",
            csrfToken: req.csrfToken()
        });
    } else { // unauthorized
        console.log(`unauthorized`);
        res.redirect("login");
    }
});

// create new post
app.post("/new", upload.single("img"), csrfProtection, (req, res, next) => {
    let postBean = new Object();
    // hard-code for now
    let imgPrefix = process.env.IMG_PREFIX;
    let imgName = uuidv4();
    let imgType = fileType(req.file.buffer)["ext"];
    postBean.postid = validator.escape(req.body.postid);
    postBean.title = validator.escape(req.body.title);
    postBean.author = validator.escape(req.body.author);
    postBean.time = moment().unix();
    postBean.img = imgPrefix + imgName + "." + imgType;
    postBean.desc = validator.escape(req.body.desc);
    azurestor.uploadFile(imgName, imgType, req.file.buffer, (err) => {
        if (err) {
            res.redirect("/adminpanel");
        } else {
            dao.newPost(postBean, (err) => {
                res.redirect("/adminpanel");
            });
        }
    });
});

// delete existing post
app.post("/del", upload.none(), csrfProtection, (req, res, next) => {
    let postid = validator.escape(req.body.postid);
    dao.delPost(postid, (err) => {
        if (err) {
            console.log(err);
        }
        res.redirect("/adminpanel");
    });
});

// logged in users gets redirected to adminpanel
app.get("/login", (req, res) => {
    if (req.session.user != null) { // logged in
        console.log(`authorized user: ${req.session.user}`);
        res.redirect("adminpanel");
    } else { // not logged in
        console.log(`unauthorized`);
        res.render("login", {
            csrfToken: req.csrfToken()
        });
    }
});

// actual code to process the upload operation

// for now let me borrow the reverse credential trick
app.post("/login", upload.none(), csrfProtection, (req, res, next) => {
    let userId = validator.escape(req.body.uname).trim();
    let password = validator.escape(req.body.passwd).trim();
    let errorMessage = [];

    if (!userId || userId.length == 0) {
        errorMessage.push("User Id is required");
    }

    if (!password || password.length == 0) {
        errorMessage.push("Password is required");
    }

    if (errorMessage.length == 0 && userId != password.split("").reverse().join("")) {
        errorMessage.push("Incorrect login credentials");
    }

    if (errorMessage.length > 0) {
        console.log("Error logging in:", errorMessage);
        res.render('login');
    } else {
        req.session.user = userId;
        res.redirect("/adminpanel");
    }
});

// show post
app.get("/post/*", (req, res, next) => {
    let postid = uuidRegEx().exec(req.path)[0];
    dao.getPost(postid, (err, doc) => {
        if (err) {
            console.log(error);
            res.redirect("/");
        } else {
            console.log("rendering post");
            res.render("post", doc);
        }
    });
});

// index page
app.get("/", (req, res, next) => {
    dao.getAllPosts((err, doc) => {
        if (err) {
            console.log(error);
            res.render("index", null);
        } else {
            res.render("index", {
                posts: doc
            });
        }
    });
});

// default route page
app.use((req, res, next) => {
    res.redirect("/");
});

module.exports.app = app;