# alice-command-skill
Навык для Яндекс Алисы, который позволяет выполнять несколько сценариев умного дома.

Например:
* включи люстру и телевизор
* выключи люстру и включи телевизор
* включи аквариум и телевизор и выключи люстру

### Install

```shell
# git clone https://github.com/subnetsRU/alice-command-skill.git
# cd alice-command-skill
# npm install
```
Отредактируйте index.js и добавьте необходимую информацию в объекте *config*, а затем запустите навык:
```shell
# npm start
```

Более подробное описание доступно на [wiki.yaboard.com](https://wiki.yaboard.com/): [Выполнить_несколько_сценариев_за_один_раз,_таймеры_для_сценариев](https://wiki.yaboard.com/s/nw).

### Todos
 - выполнение сценариев по таймеру
 - поработать над обработчиками ошибок
 - да и в целом тут есть над чем поработать, но для старта пойдет

License
----

MIT

P.S. Идея взята [отсюда](https://flows.nodered.org/node/node-red-contrib-yandex-alice-command).