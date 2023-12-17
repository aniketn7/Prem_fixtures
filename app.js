const express = require("express");
const path = require("path");
const bodyParser = require('body-parser')
const fs = require('fs').promises;
const axios = require("axios");
require("dotenv").config({ path: path.resolve(__dirname, '.env') });
const { MongoClient, ServerApiVersion } = require('mongodb'); 
const { todo } = require("node:test");
const moment = require('moment-timezone');

const portNumber = "5001";

// CLI
console.log(`Web server started and running at http://localhost:${portNumber}`);
const prompt = "Stop to shut down the server:";
console.log(prompt);

process.stdin.on('readable', () => {
    let input = process.stdin.read();
    if (input != null) {
        let command = input.toString().trim();
        if (command == 'stop') {
            console.log('Shutting down the server');
            process.exit(0);
        }
        console.log(prompt);
        process.stdin.resume();
    }
});

const app = express();
app.set("views", path.resolve(__dirname, "templates"));
app.set("view engine", "ejs");
app.use(express.static(__dirname + "/public"));
app.use(bodyParser.urlencoded({ extended: false })); // used for post

let teams = [];
let timezone = "";

app.get("/", (req, res) => {
    // get prem teams and store to text file
    // get timezones and store to text file
    const currYear = new Date().getFullYear();

    axios.get("https://api-football-v1.p.rapidapi.com/v3/teams", {
        params: {
            league: '39',
            season: currYear
        },
        headers: {
            'X-RapidAPI-Key': '735058cb44msha72ba58207e68f7p16e973jsne48613f5ba13',
            'X-RapidAPI-Host': 'api-football-v1.p.rapidapi.com'
        }
    }).then(response => {
        fs.writeFile("teams.txt", JSON.stringify(response.data, null, 2), err => {
            if (err) {
                console.log("Error writing to file teams.txt: ", err);
            } else {
                console.log('Successfully wrote list of teams to teams.txt.')
            }
        })
    }).catch(error => {
        console.log("Error: ", error);
    });

    axios.get("https://api-football-v1.p.rapidapi.com/v3/timezone", {
        headers: {
            'X-RapidAPI-Key': '735058cb44msha72ba58207e68f7p16e973jsne48613f5ba13',
            'X-RapidAPI-Host': 'api-football-v1.p.rapidapi.com'
        }
    }).then(response => {
        fs.writeFile("timezones.txt", JSON.stringify(response.data, null, 2), err => {
            if (err) {
                console.log("Error writing to file timezones.txt: ", err);
            } else {
                console.log('Successfully wrote list of teams to timezones.txt.');
            }
        })
    }).catch(error => {
        console.log("Error: ", error);
    });


    res.render("index");
});

app.get("/requestFixture", async (req, res) => {
    let timezones = [];

    try {
        const teamsData = await fs.readFile('teams.txt', 'utf8');
        let jsonData = JSON.parse(teamsData);
        teams = jsonData.response.map(item => [item.team.name, item.team.id]);
        console.log("Prem teams this season: ", teams);
    } catch (err) {
        console.error("Error:", err);
    }

    try {
        const timeZData = await fs.readFile('timezones.txt', 'utf8');
        let jsonData = JSON.parse(timeZData);
        timezones = jsonData.response.map(item => item);
        console.log("Available time zones: ", timezones);
    } catch (err) {
        console.log("Error:", err)
    }

    let teamSelector = "";
    teams.forEach(team => {
        teamSelector += `<div class="form-check"><input class="form-check-input" type="radio" name="teamSelector" id="team${team[1]}" value="team${team[1]}"><label class="form-check-label" for="team${team[1]}">${team[0]}</label></div>`
    });

    let timeZSelector = "";
    timezones.forEach(timeZ => {
        if (timeZ == "America/New_York") {
            timeZSelector += `<option selected value="${timeZ}">${timeZ}</option>`;
        } else {
            timeZSelector += `<option value="${timeZ}">${timeZ}</option>`;
        }
    });

    const variables = {
        teamSelector: teamSelector,
        timeZSelector: timeZSelector
    }

    res.render("fixtureQuery", variables);
});

app.post("/queryFixtures", (req, res) => {
    const teamId = req.body.teamSelector.replace(/\D/g, "");
    timezone = req.body.timeZSelector;
    const numFixtures = req.body.numFixturesSelector;
    let resJson = "";
    let fixtureRes = "";
    
    axios.get("https://api-football-v1.p.rapidapi.com/v3/fixtures", {
        params: {
            team: teamId,
            next: numFixtures,
            timezone: timezone
        },
        headers: {
            'X-RapidAPI-Key': '735058cb44msha72ba58207e68f7p16e973jsne48613f5ba13',
            'X-RapidAPI-Host': 'api-football-v1.p.rapidapi.com'
        }
    }).then(response => {
        // console.log(JSON.stringify(response.data, null, 2));
        let fixtureRes = JSON.stringify(response.data);
        resJson = JSON.parse(fixtureRes);
        console.log(resJson.response);

        let home = "";
        let away = "";
        let datetime = "";
        let venue = "";
        let league = "";
        let fixId = "";
        let tableRows = "";
        let counter = 1;
        resJson.response.forEach(fix => {
            home = fix.teams.home.name;
            away = fix.teams.away.name;
            datetime = moment(fix.fixture.date).tz(timezone).format('MMMM Do YYYY, h:mm:ss a');
            venue = fix.fixture.venue.name + ", " + fix.fixture.venue.city;
            league = fix.league.name;
            fixId = fix.fixture.id;

            tableRows += `<tr><td>${home}</td><td>${away}</td><td>${datetime}</td><td>${venue}</td><td>${league}</td><td><input class="form-check-input" type="checkbox" name="fixture${counter}" value="${fixId}" id="${fixId}"></td></tr>`;
            counter++;
        });

        const variables = {
            fixtures: tableRows,
            numFix: numFixtures,
            teamName: teams.find(([first, second]) => second == teamId)[0]
        };
        res.render("fixtureResults", variables);
        
    }).catch(error => {
        console.log("Error:", error);
    })
});

app.post("/savedFixtures", async (req, res) => {
    for (key in req.body) {
        const response = await axios.get("https://api-football-v1.p.rapidapi.com/v3/fixtures", {
            params: {
                id: req.body[key],
                timezone: timezone
            },
            headers: {
                'X-RapidAPI-Key': '735058cb44msha72ba58207e68f7p16e973jsne48613f5ba13',
                'X-RapidAPI-Host': 'api-football-v1.p.rapidapi.com'
            }
        }).then(async response => {
            let fixtureRes = JSON.stringify(response.data);
            resJson = JSON.parse(fixtureRes);
            let home = "";
            let away = "";
            let datetime = "";
            let venue = "";
            let league = "";
            for (const fix of resJson.response) { 
                home = fix.teams.home.name;
                away = fix.teams.away.name;
                datetime = moment(fix.fixture.date).tz(timezone).format('MMMM Do YYYY, h:mm:ss a');
                venue = fix.fixture.venue.name + ", " + fix.fixture.venue.city;
                league = fix.league.name;

                await insertFix(home, away, datetime, venue, league);
            }
        })
    }

    const result = await getAllFix();
    
    let home = "";
    let away = "";
    let datetime = "";
    let venue = "";
    let league = "";
    let tableRows = "";
    result.forEach(fix => {
        home = fix.home;
        away = fix.away;
        datetime = fix.datetime;
        venue = fix.venue;
        league = fix.league;

        tableRows += `<tr><td>${home}</td><td>${away}</td><td>${datetime}</td><td>${venue}</td><td>${league}</td></tr>`;
    });

    const variables = {
        savedFixtures: tableRows
    }

    res.render("savedFixtures", variables);
});

app.get("/deleteSaved", async (req, res) => {
    const result = await clearAll();
    res.render("deleted");
})

const uri = process.env.MONGO_CONNECTION_STRING;
const databaseAndCollection = {db: "final-proj", collection:"fixtures"};

async function clearAll() {
    const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });
    try {
        await client.connect();

        const result = await client.db(databaseAndCollection.db).collection(databaseAndCollection.collection).deleteMany({});
        if (result) {
            return result.deletedCount;
        }

    } catch (e) {
        console.error(e);
    } finally {
        await client.close();
    }
}

async function getAllFix() {
    const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });
    try {
        await client.connect();

        const cursor = client.db(databaseAndCollection.db).collection(databaseAndCollection.collection).find({});
        const result = await cursor.toArray();
        if (result) {
            return result;
        }

    } catch (e) {
        console.error(e);
    } finally {
        await client.close();
    }
}

async function insertFix(home, away, datetime, venue, league) {
    const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });
    try {
        await client.connect();

        let fix = {home: home, away: away, datetime: datetime, venue: venue, league: league};
        const result = await client.db(databaseAndCollection.db).collection(databaseAndCollection.collection).insertOne(fix);

    } catch (e) {
        console.error(e);
    } finally {
        await client.close();
    }
}

app.listen(portNumber);