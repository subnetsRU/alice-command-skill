/*
    Author: Nikolaev Dmitry (VI:RUS)
    Licence: MIT
    
    Version: 0.2.0
    Date: 28.06.2020
    Description: https://wiki.yaboard.com/s/nw
    Source: https://github.com/subnetsRU/alice-command-skill
*/

const fs = require('fs');
const https = require('https');
const express = require('express');			//https://expressjs.com/ru/4x/api.html
const { includes, lowerCase, keys } = require('lodash');
const sprintf = require("sprintf-js").sprintf;        //https://www.npmjs.com/package/sprintf-js
const exit = process.exit;

var config = require("./config.js");
config.csrf = '';
config.port = config.port || 8443;

var app = express();
const serverOptions = {
  key: fs.readFileSync(config.ssl.key),
  cert: fs.readFileSync(config.ssl.crt),
  requestCert: false,
};

function get_csrf(){
    let promise = new Promise((resolve, reject) => {
	    csrf = '';
	    request =  '';
	    let options = {
		//https://yandex.ru/quasar/iot
		protocol: 'https:',
		hostname: 'yandex.ru',
		path: '/quasar/iot',
		headers: {
		    'Content-Type': 'application/x-www-form-urlencoded',
		    'Cookie' : config.cookie,
		},
		timeout: 2000,
		agent: false
	    }
	    //console.log('step3 opt',options);
	    var req = https.request(options, (res) => {
		console.debug(sprintf('get_csrf response code [%s] message [%s]', res.statusCode,res.statusMessage));
		if (res.statusCode != 200){
		    reject('get_csrf response code #' + res.statusCode);
		    console.debug('get_csrf response headers:',res.headers);
		}
		res.on('data', (data) => {
		    data = data.toString();
		    if (!config.csrf){
			//console.log('data',data);
			let re = /csrfToken2\":\"(\S+:\d+)\",\"/;	//"
			let matches = data.match(re);
			//console.log('matches',matches);
			if (matches != null && typeof matches[1] != 'undefined'){
			    config.csrf = matches[1];
			    //console.log('++set config.csrf',config.csrf);
			    resolve(config.csrf);
			}
		    }
		});
	    });
	    req.on('error', (error) => {
		console.error(sprintf('get_csrf request failed [%s]',error));
		reject(error);
	    });
	    req.on('timeout',(data) => {
		console.error(sprintf('get_csrf timeout, aborting request'));
		req.abort();
		reject('get_csrf timeout');
	    });
	    
	    req.on('close',() => {
		console.debug(sprintf('get_csrf request closed'));
		resolve();
	    });

	    req.write(request);
	    req.end();
    });
 return promise;
}

function alice_run(scenario){
    let promise = new Promise((resolve, reject) => {
	    request =  '';
	    let options = {
		//https://iot.quasar.yandex.ru/m/user/scenarios/ + scenario_id + /actions
		protocol: 'https:',
		hostname: 'iot.quasar.yandex.ru',
		path: '/m/user/scenarios/' + scenario + '/actions',
		method: 'POST',
		headers: {
		    'Content-Type': 'application/x-www-form-urlencoded',
		    'x-csrf-token' : config.csrf,
		    'Cookie' : config.cookie,
		},
		timeout: 1000,
		agent: false
	    }
	    //console.log('alice_run opt',options);
	    var req = https.request(options, (res) => {
		console.debug(sprintf('alice_run response code [%s] message [%s]', res.statusCode,res.statusMessage));
		if (res.statusCode == 200){
		    console.log("Execute command: run scenario: ok");
		    resolve("Execute command: run scenario: ok");
		}else{
		    reject('response code #' + res.statusCode);
		    console.debug('response headers:',res.headers);
		}
	    });
	    req.on('error', (error) => {
		console.error(sprintf('alice_run request failed [%s]',error));
		reject(error);
	    });
	    req.on('timeout',(data) => {
		console.error(sprintf('timeout, aborting request'));
		req.abort();
		reject('timeout');
	    });
	    
	    req.on('close',() => {
		console.debug(sprintf('alice_run request closed'));
		resolve();
	    });

	    req.write(request);
	    req.end();
    });
 return promise;
}

async function make_response(json,resp){
    if (json){
	let utterance = lowerCase(json.request.original_utterance);
	if (!utterance){
	    utterance = "помощь";
	}
	try{
	    res = await wys(utterance);
	    //console.log('await wys fin',res);
	    if (typeof res.text != "undefined" && res.text){
		resp.response.text = res.text;
	    }
	    if (typeof res.tts != "undefined" && res.tts){
		resp.response.tts = res.tts;
	    }else{
		resp.response.tts = resp.response.text;
	    }
	}
	catch (err){
	    console.error('words parser failed');
	}
	
	if (typeof res != "undefined" && typeof res.cmd != "undefined"){
	    let csrf = await get_csrf();
	    if (config.csrf){
		for(i = 0; i < res.cmd.length; i++){
		    let run = await alice_run(res.cmd[i]);
		    console.debug('alice_run res:',run);
		}
	    }else{
		throw new Error('No csrf');
	    }
	}
    }
    
 return resp;
}

async function wys(str){
    let promise = new Promise((resolve, reject) => {
	ret = {};
	text = [];
	search = {
	    enable: [],
	    disable: [],
	};
	var end = false;
	
	if (end == false){
	    for(let intent of config.intents.help){
		if (includes(str, intent)) {
		    text.push("Я приватный навык для управления умным домом. Если вы не владелец навыка, то вы тут ничего сделать не сможете.");
		    end = true;
		}
	    }
	}
	
	if (end == false && typeof config.scenarios != "undefined"){
	    and = str.split(/\sи\s/ig);
	    //console.log('and',and);
	    let last = '';
	    for(let phrase of and){
		//console.log(phrase);
		let split = phrase.split(' ');
		//console.log('split',split);
		let f = false;
		for(let intent of config.intents.enable){
		    let pos = split.indexOf(intent);
		    if(pos > -1){
			last = 'enable';
			delete split[pos];
			search.enable.push(split.join(' ').trim());
			f = true;
		    }
		}
		for(let intent of config.intents.disable){
		    let pos = split.indexOf(intent);
		    if(pos > -1){
			last = 'disable';
			delete split[pos];
			search.disable.push(split.join(' ').trim());
			f = true;
		    }
		}
		if (f === false && last){
		    search[last].push(split.join(' ').trim());
		}
	    }
	    
	    if (search.enable.length > 0){
		let devices = [];
		let no_devices = [];
		for(let dev of search.enable){
		    //console.log('typeof ' + dev ,typeof config.scenarios.enable[dev],config.scenarios.enable[dev]);
		    if (typeof config.scenarios.enable[dev] != 'undefined' && config.scenarios.enable[dev].length > 0){
			if (typeof ret.cmd == "undefined"){
			    ret.cmd = [];
			}
			ret.cmd.push(config.scenarios.enable[dev]);
			devices.push(dev);
		    }else{
			no_devices.push(dev);
		    }
		}
		
		if (devices.length > 0){
		    text.push('Включаю');
		    text.push(devices.join(' и ') + '.');
		}
		if (no_devices.length > 0){
		    text.push('Не могу включить: '+ no_devices.join(', ') + '.');
		}
	    }
	    
	    if (search.disable.length > 0){
		let devices = [];
		let no_devices = [];
		for(let dev of search.disable){
		    //console.log('typeof ' + dev ,typeof config.scenarios.disable[dev],config.scenarios.disable[dev]);
		    if (typeof config.scenarios.disable[dev] != 'undefined' && config.scenarios.disable[dev].length > 0){
			if (typeof ret.cmd == "undefined"){
			    ret.cmd = [];
			}
			ret.cmd.push(config.scenarios.disable[dev]);
			devices.push(dev);
		    }else{
			no_devices.push(dev);
		    }
		}
		
		if (devices.length > 0){
		    text.push('Выключаю');
		    text.push(devices.join(' и ') + '.');
		}
		if (no_devices.length > 0){
		    text.push('Не могу выключить: '+ no_devices.join(', ') + '.');
		}
	    }
	}

	if (text.length == 0){
	    ret.text = "Я вас не поняла, повторите пожалуйста.";
	}else{
	    ret.text = text.join(' ');
	}
	resolve(ret);
    });
 return promise;
}

app.get('/', function (req, res) {
    res.sendStatus(400);
});

app.post('/', function (req, res) {
    var bodyStr = '';
    req.on("data",function(chunk){
        bodyStr += chunk.toString();
    });
    req.on("end",function(){
	//console.debug('Got body:', bodyStr);
	async function reply(req,res,body){
	    var resp = {
		version: '1.0',
		response: {
		    text: "Что-то пошло не так...",
		    tts: "Что-то пошло не так.",
		    end_session: true,
		},
	    };
	    
	    json = false;
	    try {
		json = JSON.parse(body);
		resp.version = json.version;
		console.debug('incoming JSON:',json);
		if (json.request.command == "ping"){
		    resp.response.text = 'pong';
		    delete resp.response.tts;
		    json = false;
		}
	    }
	    catch (error) {
		console.error('json parse failed',error);
	    }
	    
	    if (json !== false){
		auth = false;
		if (typeof json.session.user != "undefined" && typeof json.session.user.user_id != "undefined"){
		    for(let uid of config.auth.user_id){
			if (uid === json.session.user.user_id){
			    console.debug('Authentication by user.user_id');
			    auth = true;
			    break;
			}
		    }
		}
		if (auth == false){
		    if (typeof json.session.application != "undefined" && typeof json.session.application.application_id != "undefined"){
			for(let uid of config.auth.application){
			    if (uid === json.session.application.application_id){
				console.debug('Authentication by application.application_id');
				auth = true;
				break;
			    }
			}
		    }
		}
		if (auth == false){
		    //follback to old application filed  - supress yandex dialog bug -> https://yaboard.com/task/5ea97bb0e2356e6add0180c0
		    if (typeof json.session.user_id != "undefined"){
			for(let uid of config.auth.application){
			    if (uid === json.session.application.application_id){
				console.debug('Authentication by user_id');
				auth = true;
				break;
			    }
			}
		    }
		}
		if (auth === true){
		    try{
			resp = await make_response(json,resp);
		    }
		    catch(error){
			console.error('make_response error:',error);
			resp.response.text += ' Во время выполнения произошла какая то ошибка.';
			resp.response.tts += ' Во время выполнения произошла какая то ошибка.';
			resp.response.end_session = false;
		    }
		}else{
		    resp.response.text = 'Вы не авторизованы для использования данного навыка.';
		    resp.response.tts = resp.response.text;
		}
	    }
	    
	    console.log('response',resp);
	    res.json(resp);
        }
        reply(req,res,bodyStr);
    });
});

var server = https.createServer(serverOptions, app).listen(config.port);

/*
    JSON Formatter: https://chrome.google.com/webstore/detail/json-formatter/bcjindcccaagfpapjjmafapmmgkkhgoa/related?hl=ru
*/