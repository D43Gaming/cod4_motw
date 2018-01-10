var express = require('express');
var app = express();
var mysql = require('mysql');
var async = require('async');
var shuffle = require('shuffle-array');
var config = require('./config.json');
//var fs = require("fs");

var maps = [
        {displayname: "Bloc", filename: "mp_bloc"},
        {displayname: "Bog", filename: "mp_bog"},
        {displayname: "Wetwork", filename: "mp_cargoship"},
        {displayname: "Ambush", filename: "mp_convoy"},
        {displayname: "Countdown", filename: "mp_countdown"},
        {displayname: "Downpour", filename: "mp_farm"},
        {displayname: "Pipeline", filename: "mp_pipeline"},
        {displayname: "Showdown", filename: "mp_showdown"},
        {displayname: "Creek", filename: "mp_creek"},
];


var con = null;

function reconnect() {
	console.log("reconnect mysql");
	con = mysql.createConnection(config.mysql);
}

reconnect();

function getVotes(req, res, callback)
{
	con.query("SELECT vote as map, COUNT(vote)-1 as votes FROM votes GROUP BY vote ORDER BY COUNT(vote) DESC", function (err, result, fields) {
		if (err) {
			callback(err, null);
			return;
		}
		//console.log(result);

		var voteresults = result.map(x => x.map+";"+x.votes).join(";");
		callback(null, voteresults);
	});
}

function getOwnVote(req, res, callback) {
	con.query("SELECT vote FROM votes WHERE player=? LIMIT 1", [req.params.playerid], function (err, result, fields) {
		if (err) {
			callback(err, null);
			return;
		}
		//console.log(result);
	
		var vote = "notvotedyet";
		if(result.length > 0)
			vote = result[0].vote;

		callback(null, vote);
	});
}

function doQueries(retry, req, res) {
	async.parallel([
			callback => getVotes(req, res, callback), 
			callback => getOwnVote(req, res, callback)
		], 
		(error, result) => {
			
			console.log("results:");
			console.log(error);
			console.log(result);
			
			if(error && retry > 0) {
				reconnect();
				doQueries(0, req, res);
				return;
			} else {
				if(error)
					throw error;
			}
		
			
			res.end(result[0] + ":" + result[1]);
		}
	);
}

app.get('/d43_motw/status/:playerid/:token', function (req, res) {

	if("asdf123" !== req.params.token) {
		res.end("Error");
		return;
	}

	console.log("get votes for " + req.params.playerid);
		
	doQueries(1, req, res);

	//res.end("Error");
})

function doVote(retry, req, res) {
	
	try {
		con.query("INSERT INTO votes SET player=?, vote=? ON DUPLICATE KEY UPDATE vote=?", [req.params.playerid, req.params.choice, req.params.choice], function (err, result, fields) {
			if (err) {
				res.end("Error");
				throw err;
			}
			console.log(result);
		});	
	} catch(e) {		
		if(retry > 0) {
			reconnect();
			doVote(0);
		} else {
			throw e;
		}
	}

	console.log(req.params.playerid + " has voted for " + req.params.choice);
} 

app.get('/d43_motw/vote/:playerid/:token/:choice', function (req, res) {
	if("asdf123" !== req.params.token) {
		res.end("Error");
		return;
	}

	doVote(1, req, res);

	res.end("Ok");	
});

app.get('/d43_motw/finish_voting', function (req, res) {
	console.log("finish_voting");

	try {
		con.query("SELECT vote as map FROM votes GROUP BY vote ORDER BY COUNT(vote) DESC LIMIT 1", function (err, result, fields) {
			console.log(result);

			if(result.length > 0) {
				var voted_map = result[0].map;
				var filename = maps.find(x => x.displayname === voted_map).filename;
				res.end(filename);
			} else {
				console.log("no voted map");
				res.end("mp_pipeline"); // avoid errors :P
			}

			// prepare next vote
			con.query("DELETE FROM votes", (err, result, fields) => {

				var options = maps;
				shuffle(options);
				var param = [];
				for(i=0;i<8;i++) {
					param.push("(" + i + ", " + "'" + options[i].displayname + "'" + ")");
				}
				console.log(param.join(","));
				con.query("INSERT INTO votes (player, vote) VALUES " + param.join(","), (err, result, fields) => {
					if(err)
						throw err;
				});
			});
		});
	} catch(e) {
		throw e;
	}
});



var server = app.listen(12001, function () {

  var host = server.address().address
  var port = server.address().port

  console.log("Voting app listening at http://%s:%s", host, port)

})
