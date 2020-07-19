/*
    Author: Nikolaev Dmitry (VI:RUS)
    Licence: MIT
    
    Version: 0.6.0
    Date: 19.07.2020
    Description: https://wiki.yaboard.com/s/oi
    Source: https://github.com/subnetsRU/alice-command-skill
    
    Yaboard: https://yaboard.com/task/5da05e4b75e2e73e5c847c84
*/

const fs = require('fs');
const https = require('https');
const express = require('express');			//https://expressjs.com/ru/4x/api.html
const { includes, lowerCase, keys } = require('lodash');
const sprintf = require("sprintf-js").sprintf;        //https://www.npmjs.com/package/sprintf-js
const { Console } = require('console');
const path = require('path');
const util = require('util');
const exit = process.exit;
const argv = process.argv.slice(2);
const readline = require("readline");
process.title = 'alice-command-skill';

var config = require("./config.js");
config.csrf = '';
config.port = config.port || 8443;
config.log.type = config.log.type || 'cli';
config.log.logfile = '';
config.login = config.login || '';
config.pass = config.pass || '';
config.cookie = config.cookie || '';

if (config.log.type == 'all' || config.log.type == 'log'){
    config.log.folder = __dirname;
    config.log.log_file_name = config.log.log_file_name || "acs.log";
    config.log.logfile = config.log.folder + '/' + config.log.log_file_name;
}

var last_report = {};
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

var timer_interval = (((typeof config.timer_period != "undefined" && parseInt(config.timer_period) > 0) ? (config.timer_period * 60) : (5*60)) * 1000);

var app = express();
const serverOptions = {
  key: fs.readFileSync(config.ssl.key),
  cert: fs.readFileSync(config.ssl.crt),
  requestCert: false,
};

function get_cookie(){
    let promise = new Promise((resolve, reject) => {
	    config.cookie = '';
	    request =  'login=' + config.login + '&passwd=' + config.pass;
	    let options = {
		//https://passport.yandex.ru/passport?mode=auth&retpath=https://ya.ru
		protocol: 'https:',
		hostname: 'passport.yandex.ru',
		path: '/passport?mode=auth&retpath=https://ya.ru',
		method: 'POST',
		headers: {
		    'Content-Type': 'application/x-www-form-urlencoded',
		},
		timeout: 2000,
		agent: false
	    }
	    var req = https.request(options, (res) => {
		console.debug(sprintf('get_cookie response code [%s] message [%s]', res.statusCode,res.statusMessage));
		if (res.statusCode == 302){
		    cookies = '';
		    if (typeof res.headers['set-cookie'] != "undefined"){
			//console.debug('get_cookie response headers:',res.headers['set-cookie']);
			res.headers['set-cookie'].forEach(function(item, i, arr){
			    tmp_cookie = item.substring(0, item.indexOf('; ')) + ";";
			    cookies += tmp_cookie;
			});
		    }
		    //console.debug('cookies',cookies);
		    if (cookies){
			config.cookie = cookies;
			console.info('get cookies success');
		    }else{
			console.error('get cookies failed');
		    }
		}else{
		    console.debug('get_cookie response headers:',res.headers);
		    reject('get_cookie response code #' + res.statusCode);
		}
	    });
	    req.on('error', (error) => {
		console.error(sprintf('get_cookie request failed [%s]',error));
		reject(error);
	    });
	    req.on('timeout',(data) => {
		console.error(sprintf('get_cookie timeout, aborting request'));
		req.abort();
		reject('get_cookie timeout');
	    });
	    
	    req.on('close',() => {
		console.debug(sprintf('get_cookie request closed'));
		if (config.cookie){
		    resolve(config.cookie);
		}
	    });
	    req.write(request);
	    req.end();
    });
 return promise;
}

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
		    console.debug('get_csrf response headers:',res.headers);
		    reject('get_csrf response code #' + res.statusCode);
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
			    console.info('get csrf success');
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
		if (config.csrf){
		    resolve(config.csrf);
		}
	    });

	    req.write(request);
	    req.end();
    });
 return promise;
}

function alice_run(scenario){
    let promise = new Promise((resolve, reject) => {
	if (typeof scenario == 'string'){
	    var tmp = scenario;
	    scenario = { id: tmp };
	    delete tmp;
	}
	if (typeof scenario.name == "undefined"){
	    scenario.name = 'unknown';
	}
	if (typeof scenario.id != "undefined"){
	    request =  '';
	    let options = {
		//https://iot.quasar.yandex.ru/m/user/scenarios/ + scenario_id + /actions
		protocol: 'https:',
		hostname: 'iot.quasar.yandex.ru',
		path: '/m/user/scenarios/' + scenario.id + '/actions',
		method: 'POST',
		headers: {
		    'Content-Type': 'application/x-www-form-urlencoded',
		    'x-csrf-token' : config.csrf,
		    'Cookie' : config.cookie,
		},
		timeout: 2000,
		agent: false
	    }
	    //console.log('alice_run opt',options);
	    var req = https.request(options, (res) => {
		console.debug(sprintf('alice_run response code [%s] message [%s]', res.statusCode,res.statusMessage));
		last_report = { name: scenario.name, date: parseInt(new Date().getTime()/1000), status: res.statusCode };
		console.debug('last_report',last_report);
		if (res.statusCode == 200){
		    console.debug("Execute command: run scenario: ok");
		    resolve(res.statusCode);
		}else{
		    console.debug('response headers:',res.headers);
		    reject(res.statusCode);
		}
	    });
	    req.on('error', (error) => {
		console.error(sprintf('alice_run request failed [%s]',error));
		last_report = { name: scenario.name, date: parseInt(new Date().getTime()/1000), status: 'ошибка' };
		console.debug('last_report',last_report);
		reject("alice_run ошибка");
	    });
	    req.on('timeout',(data) => {
		console.error(sprintf('timeout, aborting request'));
		last_report = { name: scenario.name, date: parseInt(new Date().getTime()/1000), status: 'таймаут' };
		console.debug('last_report',last_report);
		req.abort();
		reject('alice_run таймаут');
	    });
	    
	    req.on('close',() => {
		console.debug(sprintf('alice_run request closed'));
	    });

	    req.write(request);
	    req.end();
	}else{
	    last_report = { name: scenario.name, date: parseInt(new Date().getTime()/1000), status: 'неизвестен' };
	    console.debug('last_report',last_report);
	    reject('id сценария неизвестен.');
	}
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
	    if (config.login && config.pass && !config.cookie){
		let gc = await get_cookie();
	    }
	    try{
		let csrf = await get_csrf();
	    }
	    catch(e){
		console.error('csrf error:',e);
		if (config.login && config.pass){
		    config.cookie = '';
		}
	    }
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
	var err = [];
	var weekDays = {
	    '1': ['понедельник','понедельникам'],
	    '2': ['вторник','вторникам'],
	    '3': ['среда','среду','средам'],
	    '4': ['четверг','четвергам'],
	    '5': ['пятница','пятницу','пятницам'],
	    '6': ['суббота','субботу','субботам'],
	    '0': ['воскресенье','воскресеньям'],
	};
	
	if (str === 'ping') {
	    text.push('pong');
	    end = true;
	}
	
	if (end == false){
	    for(let intent of config.intents.help){
		if (includes(str, intent)) {
		    text.push("Я могу выполнять несколько сценариев за одну команду. Например:");
		    text.push("Выключи люстру и включи лампу и телевизор.");
		    text.push("А так же могу выполнять сценарии по таймеру. Например:");
		    text.push("Добавь таймер выключи телевизор через 15 минут.");
		    text.push("Добавь таймер включи лампу в 21 час.");
		    text.push("Добавь таймер выключи люстру по будням в 21 час 15 минут.");
		    text.push("Подробнее в документации на wiki.yaboard.com");
		    text.push("Так же вы можете узнать стату последней операции по команде \"отчёт\".");
		    end = true;
		}
	    }
	}
	
	if (end == false){
	    if (str == 'отчет' || str == 'счет'){
		if(typeof last_report.name != "undefined"){
		    let date = '';
		    if(typeof last_report.date != "undefined"){
			let time = new Date((last_report.date * 1000));
			date = time.getDate() + ' числа в ' + time.getHours() + ':'+ time.getMinutes();
		    }
		    text.push('Сценарий "' + last_report.name + '" статус '+ last_report.status + (date ? ' от ' + date : '') + '.');
		}else{
		    text.push('Отчёт отсутствует.');
		}
	    }
	}
	
	if (end == false){
	    getIntents = keys(config.intents);
	    for (let i of getIntents){
		//console.debug('getIntents',i);
		if (typeof config.intents[i] == "object"){
		    //for (let item of config.intents[i]) {
		    for (ik = 0; ik < config.intents[i].length; ik++){
			let item = config.intents[i][ik];
			//console.debug('\t'+ ik + ': ' + item + ' => ' +includes(str, item));
			if (includes(str, item)) {
			    if (typeof search.intents[i] == "undefined"){
				search.intents[i] = 0;
			    }
			    search.intents[i]++;
			}
		    }
		}
	    }
	    
	    //console.debug(search);
	}
	if (typeof config.scenarios == "undefined"){
	    text.push('Сценарии отсутствуют. Проверьте конфигурационный файл навыка.');
	    end = true;
	}
	
	if (end == false && (/\sчерез\s/).test(str)){
	    if ( (typeof search.intents['timers'] == "undefined") && (typeof search.intents['enable'] != "undefined" || typeof search.intents['disable'] != "undefined") ){
		str = 'добавить таймер ' + str;
		search.intents['timers'] = true;
	    }
	}
	
	if (end == false && (typeof search.intents['timers'] != "undefined")){
	    let regexp = '(какие\\s(есть|установлены|добавлены|созданы)|список)\\s' + config.intents.timers.join('|') + '[а-я]{1,2}?';
	    let re = new RegExp(regexp,'u');
	    let matches = str.match(re);
	    if (matches !== null){
		if (timers.length > 0){
		    text.push("Всего таймеров: " + timers.length + '.');
		    timers.forEach(function(timer, i, arr){
			let tmp = [];
			console.log(timer);
			tmp.push((i+1) + '. ' + timer.name);
			tmp.push(config.intents[timer.action][0]);
			let when = [];
			if (typeof timer.days != "undefined"){
			    if (timer.days.length == 7){
				when.push('ежедневно');
			    }else if(timer.days.sort().toString() == [6,0].sort().toString()){
				when.push('по выходным');
			    }else if(timer.days.sort().toString() == [1,2,3,4,5].sort().toString()){
				when.push('по будням');
			    }else{
				for(let day of timer.days){
				    if(typeof weekDays[day] !== "undefined"){
					when.push(weekDays[day][0]);
				    }
				}
			    }
			}
			if (typeof timer.once != "undefined"){
			    let time = new Date((timer.once * 1000));
			    when.push('один раз');
			    timer.hour = time.getHours();
			    timer.min = time.getMinutes();
			}
			
			if (typeof timer.hour != "undefined"){
			    let tmp = 'час';
			    if (timer.hour == 0){
				tmp = 'часов';
			    }else if ((timer.hour >= 2 && timer.hour < 5) || (timer.hour >= 22 && timer.hour < 25)){
				tmp = 'часа';
			    }else if (timer.hour >= 5 && timer.hour < 21){
				tmp = 'часов';
			    }
			    when.push('в ' + timer.hour + ' ' + tmp);
			}
			if (typeof timer.min != "undefined"){
			    when.push(timer.min + ' минут');
			}
			tmp.push(when.join(' '));
			
			text.push(tmp.join(', ') + '.');
		    });
		}else{
		    text.push("Таймеры отсутствуют.");
		}
		end = true;
	    }
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
		    if ((/(будням|будни|выходным|выходные|часов|часа|час|минут|минуты)/).test(matches[5])){
			twhen = matches[5];
		    }
		}
	    }
	    
	    if (scenario === false){
		err.push('Название сценария не найдено.');
	    }else if (action === false){
		err.push('Отсутствует действие с таймером.');
	    }else if (saction === false){
		err.push('Отсутствует действие со сценарием.');
	    }else if (twhen === false){
		err.push('Отсутствует указание времени.');
	    }
	    
	    if (err.length == 0){
		tcfg = {name: scenario.name, action: saction, id: scenario.id};
		if ((/(будням|будни|выходным|выходные)/).test(twhen)){
		    if ((/(будням|будни)/).test(twhen)){
			tcfg.days = [1,2,3,4,5];
		    }else if ((/(выходным|выходные)/).test(twhen)){
			tcfg.days = [6,0];
		    }
		}else{
		    let tmp = [];
		    for (const [key, value] of Object.entries(weekDays)) {
			let regexp = '(' + value.join('|') + ')';
			let re = new RegExp(regexp,'u');
			let matches = twhen.match(re);
			if (matches !== null){
			    tmp.push(parseInt(key));
			}
		    }
		    if (tmp.length > 0){
			tcfg.days = tmp;
		    }
		}
		
		if (typeof tcfg.days == "undefined"){
		    tcfg.days = [0,1,2,3,4,5,6];
		}
		
		regexp ='(в|с|через)\\s(\\d+)\\s(часов|часа|час)';
		re = new RegExp(regexp,'u');
		matches = twhen.match(re);
		if (matches != null){
		    if (typeof matches[2] != "undefined"){
			tcfg.hour = matches[2];
		    }
		}
		
		if (tcfg.hour > 24){
		    err.push('Часы не могут быть больше 24.');
		}
		
		
		regexp = '\\s(\\d+)\\s(минут|минуты)';
		re = new RegExp(regexp,'u');
		matches = twhen.match(re);
		if (matches != null){
		    if (typeof matches[1] != "undefined"){
			tcfg.min = matches[1];
		    }
		}
		
		if (tcfg.min > 59){
		    err.push('Минуты не должны превышать 59.');
		}
		
		if ((/через/).test(twhen)){
		    tcfg.once = parseInt(new Date().getTime()/1000) + ((typeof tcfg.hour != "undefined") ? (tcfg.hour * 60 * 60) : 0) + ((typeof tcfg.min != "undefined") ? (tcfg.min * 60) : 0);
		    delete tcfg.days;
		}
	    }
	    
	    if (err.length == 0){
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
			err.push("Таймер для удаления не найден.");
		    }
		}
	    }
	    
	    if (err.length == 0){
		fs.writeFileSync('./timers.json',JSON.stringify(timers));
		if (typeof tcfg != "undefined"){
		    console.debug('timer ' + action,tcfg);
		}
	    }
	    
	    if (err.length > 0){
		text.push('Ошибки: ' + err.join(' '));
	    }
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
			ret.cmd.push({name: dev, id: config.scenarios.enable[dev]});
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
			ret.cmd.push({name: dev, id: config.scenarios.disable[dev]});
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
	    
	    if (typeof timer.once == "undefined"){
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
			end_time = parseInt(start_time.getTime()/1000) + ((timer_interval/1000) * 2);
			start_time = parseInt(start_time.getTime()/1000);
		    }
		}
	    }else{
		start_time = new Date((timer.once * 1000));
		start_time.setSeconds(0,0);
		end_time = parseInt(start_time.getTime()/1000) + ((timer_interval/1000) * 2);
		start_time = parseInt(start_time.getTime()/1000);
	    }
	    
	    if (start_time !== false && (start_time <= now && now <= end_time)){
		if (typeof timers_active[key] != "undefined"){
		    res = 'Был запущен';
		}else{
		    res = 'запускаю';
		    cmds.push(timer);
		    if (typeof timer.once == "undefined"){
			timers_active[key] = true;
		    }else{
			timers.splice(i, 1);
			fs.writeFileSync('./timers.json',JSON.stringify(timers));
		    }
		}
	    }else{
		delete timers_active[key];
	    }
	    var ctype = 'debug';
	    if (res != false){
		ctype = 'info';
	    }
	    console[ctype]('Process timer [' + timer.action + ': ' + timer.name + '] => result [' + res + ']');
	}
    });
    //console.debug('timers_active',timers_active);
    if (cmds.length > 0){
	console.debug('run commands',cmds);
	if (config.login && config.pass && !config.cookie){
	    let gc = await get_cookie();
	}
	try{
	    let csrf = await get_csrf();
	}
	catch(e){
	    console.error('csrf error:',e);
	    if (config.login && config.pass){
		config.cookie = '';
	    }
	}
	
	if (config.csrf){
	    for(i = 0; i < cmds.length; i++){
		let run = await alice_run(cmds[i]);
		//console.debug('alice_run [' + cmds[i] + '] result [' + run + ']');
	    }
	}else{
	    throw new Error('No csrf');
	}
    }
}

var redirectConsole = function(path){
/*
 * @param (string) path to log file
*/
    var lpath = (typeof path == "undefined") ? "/dev/null" : path;
    this.data = [];

    this.origConsole = new console.Console(process.stdout,process.stderr);
    var self = this;

    this.main = function(type,arg){
	var datetime = new Date();
	var time = sprintf("%02d.%02d.%04d %02d:%02d:%02d",datetime.getDate(),(datetime.getMonth() + 1),datetime.getFullYear(),datetime.getHours(),datetime.getMinutes(),datetime.getSeconds());
	if (type){
	    arg.unshift('['+type+']');
	}
	arg.unshift('['+time+']');
	self.data.push(util.format.apply(null, arg) + '\n');
	if (config.log.type == 'cli' || config.log.type == 'all'){
	    if (!type){
		type = 'log';
	    }
	    let tmp = [];
	    for(let d of arg){
		if(typeof d == "string"){
		    tmp.push(d);
		}else{
		    tmp.push(sprintf("%j",d));
		}
	    }
	    //self.origConsole[type.toLowerCase()](arg);
	    self.origConsole[type.toLowerCase()](tmp.join(' '));
	}
    }
    this.debug = function(){
	self.main('DEBUG',[].slice.call(arguments));
    }
    this.log = function(){
	self.main(null,[].slice.call(arguments));
    }
    this.info = function(){
	self.main('INFO',[].slice.call(arguments));
    }
    this.error = function(){
	self.main('ERROR',[].slice.call(arguments));
    }
    this.warn = function(){
	self.main('WARN',[].slice.call(arguments));
    }
    this.clear = function(){
	self.data = [];
    }
    this.len = function(){
	return self.data.length;
    }
    this.save = function(){
	if (config.log.type == 'log' || config.log.type == 'all'){
	    let len = self.data.length;
	    for(i=0; i<len; i++){
		fs.appendFileSync(lpath,self.data.shift());
	    }
	}
    }
    setInterval(this.save, 500);
}

var base64 = function(){
    var _encode = function _encode(buffer) {
	return buffer.toString('base64')
	    .replace(/\+/g, '-') // Convert '+' to '-'
	    .replace(/\//g, '_') // Convert '/' to '_'
	    .replace(/=+$/, ''); // Remove ending '='
    };
    var _decode = function _decode(base64) {
	// Add removed at end '='
	base64 += Array(5 - base64.length % 4).join('=');
	base64 = base64
	    .replace(/\-/g, '+') // Convert '-' to '+'
	    .replace(/\_/g, '/'); // Convert '_' to '/'
	return new Buffer.from(base64, 'base64');
    };

    return {
	encode: function encode(text){
	    var buffer = Buffer.from(text);
	    return _encode(buffer);
	},
	decode: function decode(base64){
	    return _decode(base64).toString('utf8');
	},
    };
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
	    //Default responce
	    var resp = {
		version: '1.0',
		response: {
		    text: "Что-то у меня пошло не так...",
		    tts: "Что-то у меня пошло не так.",
		    end_session: true,
		},
	    };
	    var session_id = 'unknown';
	    
	    var json = false;
	    var auth = false;
	    
	    try {
		json = JSON.parse(body);
		resp.version = json.version;
		console.debug('incoming JSON:',json);
		if(typeof json.session != "undefined" && typeof json.session.session_id != "undefined"){
		    session_id = json.session.session_id;
		}
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
				console.debug('Authentication by depecated session.user_id');
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
			resp.response.text += ' Во время выполнения произошла какая то ошибка. Попробуйте повторить запрос. Слушаю вас.';
			resp.response.tts += ' Во время выполнения произошла какая то ошибка. Попробуйте повторить запрос. Слушаю вас.';
			resp.response.end_session = false;
		    }
		}else{
		    resp.response.text = 'Это приватный навык и Вы не авторизованы для его использования.';
		    resp.response.tts = resp.response.text;
		}
		
		if (resp.response.text.length > 1024){
		    resp.response.text = resp.response.text.substr(0,1020) + '...';
		}
		resp.response.tts = resp.response.tts.replace(/wiki.yaboard.com/gi,'вики я бо+орд точка ком');
		if (resp.response.tts.length > 1024){
		    resp.response.tts = resp.response.tts.substr(0,1020) + '...';
		}
	    }
	    
	    console.debug('reply[' + session_id + ']:',resp);
	    res.json(resp);
        }
        reply(req,res,bodyStr);
    });
});

const b64 = base64();
if (argv.length == 0){
    if (config.login){
	config.login = b64.decode(config.login);
    }
    if (config.pass){
	config.pass = b64.decode(config.pass);
    }
    console = new redirectConsole(config.log.logfile);
    var server = https.createServer(serverOptions, app).listen(config.port);

    setInterval(async () => {
	console.info('Start timers process. Timers total: '+ timers.length);
	try {
	    await proc_timers();
	} catch (e) {
	    if (e){
		console.warn("timers caught:",e);
	    }
	}
    }, timer_interval);
}else{
    if (argv[0] == 'help' || argv[0] == '-help' || argv[0] == '--help'){
	console.info('Possible params:\n\tauth - encode login and password;');
    }else if (argv[0] == 'auth'){
	const rl = readline.createInterface({
	    input: process.stdin,
	    output: process.stdout
	});
	rl.question("Yandex login ? ", function(login) {
	    rl.question("Yandex password ? ", function(pass) {
		bl = b64.encode(login);
		bp = b64.encode(pass);
		console.info('\nLogin for config.js:',bl);
		console.info('Pass for config.js:',bp);
		rl.close();
	    });
	});
	
	rl.on("close", function() {
	    console.log("\nPut them info config.js");
	    exit(0);
	});
    }else{
	console.error('Error: unknown params:',argv);
	console.info('Try to run script with --help');
	exit(1);
    }
}

/*
    JSON Formatter: https://chrome.google.com/webstore/detail/json-formatter/bcjindcccaagfpapjjmafapmmgkkhgoa/related?hl=ru
*/