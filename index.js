/*
    Author: Nikolaev Dmitry (VI:RUS)
    Licence: MIT
    
    Version: 0.3.0
    Date: 05.07.2020
    Description: https://wiki.yaboard.com/s/nw
    Source: https://github.com/subnetsRU/alice-command-skill
    
    Yaboard: https://yaboard.com/task/5da05e4b75e2e73e5c847c84
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

var timers = refreshTimers();
var timers_active = {};
function refreshTimers(){
    var timers = [];
    if (fs.existsSync('./timers.json')) {
	var tmp = fs.readFileSync('./timers.json').toString();
	try {
	    tmp = json = JSON.parse(tmp);
	    if (Array.isArray(tmp)){
		timers = tmp;
	    }
	}
	catch(error){
	    console.error('refreshTimers failed:',error);
	}
    }
 return timers;
}

var timer_interval = ((typeof config.timer_period != "undefined" && config.timer_period > 0) ? (config.timer_period * 60) : (5*60)) * 1000;
//setTimeout(proc_timers,timer_interval);
setInterval(async () => {
    var time = new Date();
    let printable_date = sprintf("%02d.%02d.%04d %02d:%02d:%02d",time.getDate(),time.getMonth(),time.getFullYear(),time.getHours(),time.getMinutes(),time.getSeconds());
    console.log(sprintf('[%s] Start timers process. Timers total: %d',printable_date,timers.length));
    try {
        await proc_timers();
    } catch (e) {
        console.warn("caught: " + e.message)
    }
}, timer_interval);

var app = express();
const serverOptions = {
  key: fs.readFileSync(config.ssl.key),
  cert: fs.readFileSync(config.ssl.crt),
  requestCert: false,
};

async function get_csrf(){
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
	catch (error){
	    console.error('words parser failed:',error);
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
	    intents: {},
	};
	var end = false;
	
	if (str === 'ping') {
	    text.push('pong');
	    end = true;
	}
	
	if (end == false){
	    for(let intent of config.intents.help){
		if (includes(str, intent)) {
		    text.push("Я приватный навык для управления умным домом. Если вы не владелец навыка, то вы тут ничего сделать не сможете.");
		    end = true;
		}
	    }
	}
	
	if (end == false){
	    getIntents = keys(config.intents);
	    for (let i of getIntents){
		console.debug('getIntents',i);
		if (typeof config.intents[i] == "object"){
		    //for (let item of config.intents[i]) {
		    for (ik = 0; ik < config.intents[i].length; ik++){
			let item = config.intents[i][ik];
			console.debug('\t'+ ik + ': ' + item + ' => ' +includes(str, item));
			if (includes(str, item)) {
			    if (typeof search.intents[i] == "undefined"){
				search.intents[i] = 0;
			    }
			    search.intents[i]++;
			}
		    }
		}
	    }
	    
	    //console.log('found intents [' + search.intents.join(' ') + ']',search.intents.length);
	    console.log(search);
	}
	if (typeof config.scenarios == "undefined"){
	    text.push('Сценарии отсутствуют. Проверьте конфигурационный файл навыка.');
	    end = true;
	}
	
	if (end == false && (typeof search.intents['timers'] != "undefined")){
	    var actions = config.intents.action_add.concat(config.intents.action_del);
	    var en_dis = config.intents.enable.concat(config.intents.disable);
	    var action = false;
	    var saction = false;
	    var scenario = false;
	    var twhen = false;
	    var eSC = [];
	    var dSC = [];
	    for(let intent in config.scenarios.enable){
		eSC.push(intent);
	    }
	    for(let intent in config.scenarios.disable){
		dSC.push(intent);
	    }
	    
	    let regexp = '^(' + actions.join('|') +')\\s(' + config.intents.timers.join('|') + ')\\s(' + en_dis.join('|') +')\\s(' + eSC.join('|') + ')\\s(.*)$';
	    let re = new RegExp(regexp,'u');
	    let matches = str.match(re);
	    if (matches !== null){
		if (typeof matches[1] != "undefined"){
		    for(let intent of config.intents.action_add){
			if(intent == matches[1]){
			    action = 'add';
			}
		    }
		    for(let intent of config.intents.action_del){
			if(intent == matches[1]){
			    action = 'delete';
			}
		    }
		}
		if (typeof matches[3] != "undefined"){
		    for(let intent of config.intents.enable){
			if(intent == matches[3]){
			    saction = 'enable';
			}
		    }
		    for(let intent of config.intents.disable){
			if(intent == matches[3]){
			    saction = 'disable';
			}
		    }
		}
		if (typeof matches[4] != "undefined" && saction !== false){
		    if (typeof config.scenarios[saction] !== "undefined" && typeof config.scenarios[saction][matches[4]] != "undefined"){
			scenario = {name: matches[4], id: config.scenarios[saction][matches[4]]};
		    }
		}
		if (typeof matches[5] != "undefined"){
		    if ((/(будням|будни|выходным|выходные|часов|часа|час)/).test(matches[5])){
			twhen = matches[5];
		    }
		}
	    }
	    if (scenario === false){
		text.push('Название сценария не найдено.');
	    }else if (action === false){
		text.push('Отсутствует действие с таймером.');
	    }else if (saction === false){
		text.push('Отсутствует действие со сценарием.');
	    }else if (twhen === false){
		text.push('Отсутствует указание времени.');
	    }else{
		tcfg = {name: scenario.name, action: saction, id: scenario.id};
		//по будням
		//по выходным
		//(в|с) X часов
		//(в|с) X часов X минут
		if ((/(будням|будни|выходным|выходные)/).test(twhen)){
		    if ((/(будням|будни)/).test(twhen)){
			tcfg.days = [1,2,3,4,5];
		    }else if ((/(выходным|выходные)/).test(twhen)){
			tcfg.days = [6,0];
		    }
		}else{
		    tcfg.days = [0,1,2,3,4,5,6];
		}
		regexp = /(в|с)\s(\d+)\s(часов|часа|час)/;
		matches = twhen.match(regexp);
		if (matches != null){
		    if (typeof matches[2] != "undefined"){
			tcfg.hour = matches[2];
		    }
		}
		regexp = /(в|с)\s\d+\sчасов\s(\d+)\s(минут|минуты)/;
		matches = twhen.match(regexp);
		if (matches != null){
		    if (typeof matches[2] != "undefined"){
			tcfg.min = matches[2];
		    }
		}
		
		if (action == 'add'){
		    timers.push(tcfg);
		    text.push("Таймер добавлен.");
		}else if(action == 'delete'){
		    let del = 0;
		    timers.forEach(function(timer, i, arr) {
			if ( (typeof timer.action !== "undefined" && timer.action == tcfg.action) && (typeof timer.name !="undefined" && timer.name == tcfg.name) ){
			    if ( (typeof timer.days !="undefined" && timer.days.length == tcfg.days.length) && (typeof timer.hour != "undefined" && timer.hour == tcfg.hour) ){
				timers.splice(i, 1);
				del++;
			    }
			}
		    });
		    if (del > 0){
			text.push("Таймер удален.");
		    }else{
			text.push("Таймер для удаления не найден.");
		    }
		}
		fs.writeFileSync('./timers.json',JSON.stringify(timers));
	    }
	    console.debug(action,saction,scenario,(typeof tcfg == "undefined") ? null:tcfg);
	    end = true;
	}
	
	if (end == false){
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

async function proc_timers(){
    //console.log('timers',timers);
    var time = new Date();
    var now = (time.getTime()/1000);
    var day = time.getDay();
    var start_time = false;
    var end_time = false;
    var res = false;
    var cmds = [];
    timers = refreshTimers();
    
    timers.forEach(function(timer, i, arr){
	res = false;
	let key = JSON.stringify(timer);
	if (typeof timer.name != "undefined"){
	    if (typeof timer.id == "undefined"){
		res = 'Не указан ID сценария.';
	    }
	    if (typeof timer.days == "undefined"){
		res = 'Не указаны дни.';
	    }
	    if (typeof timer.hour == "undefined"){
		res = 'Не указан час.';
	    }
	    
	    start_time = false;
	    if (res == false){
		for (let d of timer.days){
		    if (day == d){
			start_time = new Date();
			break;
		    }
		}
		
		if (start_time !== false){
		    start_time.setHours(timer.hour);
		    if (typeof timer.min != "undefined"){
			start_time.setMinutes(timer.min);
		    }else{
			start_time.setMinutes(0);
		    }
		    start_time.setSeconds(0,0);
		    end_time = parseInt(start_time.getTime()/1000) + (timer_interval/1000);
		    start_time = parseInt(start_time.getTime()/1000);
		}
	    }
	    if (start_time !== false && (start_time <= now && now <= end_time)){
		if (typeof timers_active[key] != "undefined"){
		    res = 'Был запущен';
		}else{
		    res = 'запускаю';
		    timers_active[key] = true;
		    cmds.push(timer.id);
		}
	    }else{
		delete timers_active[key];
	    }
	    let printable_date = sprintf("%02d.%02d.%04d %02d:%02d:%02d",time.getDate(),time.getMonth(),time.getFullYear(),time.getHours(),time.getMinutes(),time.getSeconds());
	    console.debug('['+ printable_date + ']: Process timer [' + timer.name + '], result [' + res + ']');
	}
    });
    //console.debug('timers_active',timers_active);
    if (cmds.length > 0){
	console.debug('run commands',cmds);
	let csrf = await get_csrf();
	console.log('config.csrf',config.csrf);
	if (config.csrf){
		for(i = 0; i < cmds.length; i++){
		    let run = await alice_run(cmds[i]);
		    console.debug('alice_run ' + cmds[i] + 'res:',run);
		}
	}else{
	    throw new Error('No csrf');
	}
    }
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