/*~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
           ______     ______     ______   __  __     __     ______
          /\  == \   /\  __ \   /\__  _\ /\ \/ /    /\ \   /\__  _\
          \ \  __<   \ \ \/\ \  \/_/\ \/ \ \  _"-.  \ \ \  \/_/\ \/
           \ \_____\  \ \_____\    \ \_\  \ \_\ \_\  \ \_\    \ \_\
            \/_____/   \/_____/     \/_/   \/_/\/_/   \/_/     \/_/


This is a sample Slack bot built with Botkit.

This bot demonstrates many of the core features of Botkit:

* Connect to Slack using the real time API
* Receive messages based on "spoken" patterns
* Reply to messages
* Use the conversation system to ask questions
* Use the built in storage system to store and retrieve information
  for a user.

# RUN THE BOT:

  Get a Bot token from Slack:

    -> http://my.slack.com/services/new/bot

  Run your bot from the command line:

    token=<MY TOKEN> node slack_bot.js

# USE THE BOT:

  Find your bot inside Slack to send it a direct message.

  Say: "Hello"

  The bot will reply "Hello!"

  Say: "who are you?"

  The bot will tell you its name, where it is running, and for how long.

  Say: "Call me <nickname>"

  Tell the bot your nickname. Now you are friends.

  Say: "who am I?"

  The bot will tell you your nickname, if it knows one for you.

  Say: "shutdown"

  The bot will ask if you are sure, and then shut itself down.

  Make sure to invite your bot into other channels using /invite @<my bot>!

# EXTEND THE BOT:

  Botkit has many features for building cool and useful bots!

  Read all about it here:

    -> http://howdy.ai/botkit

~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~*/


if (!process.env.token) {
    console.log('Error: Specify token in environment');
    process.exit(1);
}

if (!process.env.apikey) {
    console.log('Error: Specify token in environment');
    process.exit(1);
}

var Botkit = require('../lib/Botkit.js');
var os = require('os');
var request = require('request');

/////////////////////////////////////////Arduinoのやーつ
var five = require("johnny-five");

var board = new five.Board();

var button;
var is_open = false;
var is_light = false;

// board.on("ready", function() {
//     // スイッチの設定
//     button = new five.Button({
//         // デジタル2番ピンにスイッチを接続
//         pin: A2,
//         // Arduinoに内蔵されているプルアップ回路を有効
//         isPullup: false
//     });
//
//     // スイッチを追加(アクセス許可)
//     board.repl.inject({
//         button: button
//     });
//
//     // スイッチを押した
//     button.on("down", function() {
//         console.log("HIGH");
//     });
//
//     // スイッチを押し続けて一定時間(初期設定では500ms)経過した
//     button.on("hold", function() {
//         console.log("HOLD");
//         is_open = false;
//     });
//
//     // スイッチを離した
//     button.on("up", function() {
//         console.log("LOW");
//         is_open = true;
//     });
// });

board.on('ready', () => {
    const s = new five.Sensor('A2');
    const l = new five.Sensor('A0');

    s.on('change', v => {
        if (v > 100) {
          console.log("key close " + v);
            is_open = false;
        } else {
          console.log("key = open " + v);
            is_open = true;
        }
    });

    l.on('change', v => {
        if (v < 100) {
            console.log("light off " + v);
            is_light = false;
        } else {
            console.log("light on " + v);
            is_light = true;
        }
    });
})

////////////////////////////////////////////

var controller = Botkit.slackbot({
    json_file_store: 'storage_bot_db',
    retry: Infinity
});

var bot = controller.spawn({
    token: process.env.token
}).startRTM();

controller.hears(['hello', 'hi'], 'direct_message,direct_mention,mention', function(bot, message) {

    bot.api.reactions.add({
        timestamp: message.ts,
        channel: message.channel,
        name: 'robot_face',
    }, function(err, res) {
        if (err) {
            bot.botkit.log('Failed to add emoji reaction :(', err);
        }
    });


    controller.storage.users.get(message.user, function(err, user) {
        if (user && user.name) {
            bot.reply(message, 'Hello ' + user.name + '!!');
        } else {
            bot.reply(message, 'Hello.');
        }
    });
});

controller.hears(['call me (.*)', 'my name is (.*)'], 'direct_message,direct_mention,mention', function(bot, message) {
    var name = message.match[1];
    controller.storage.users.get(message.user, function(err, user) {
        if (!user) {
            user = {
                id: message.user,
            };
        }
        user.name = name;
        controller.storage.users.save(user, function(err, id) {
            bot.reply(message, 'Got it. I will call you ' + user.name + ' from now on.');
        });
    });
});

controller.hears(['what is my name', 'who am i'], 'direct_message,direct_mention,mention', function(bot, message) {

    controller.storage.users.get(message.user, function(err, user) {
        if (user && user.name) {
            bot.reply(message, 'Your name is ' + user.name);
        } else {
            bot.startConversation(message, function(err, convo) {
                if (!err) {
                    convo.say('I do not know your name yet!');
                    convo.ask('What should I call you?', function(response, convo) {
                        convo.ask('You want me to call you `' + response.text + '`?', [{
                                pattern: 'yes',
                                callback: function(response, convo) {
                                    // since no further messages are queued after this,
                                    // the conversation will end naturally with status == 'completed'
                                    convo.next();
                                }
                            },
                            {
                                pattern: 'no',
                                callback: function(response, convo) {
                                    // stop the conversation. this will cause it to end with status == 'stopped'
                                    convo.stop();
                                }
                            },
                            {
                                default: true,
                                callback: function(response, convo) {
                                    convo.repeat();
                                    convo.next();
                                }
                            }
                        ]);

                        convo.next();

                    }, {
                        'key': 'nickname'
                    }); // store the results in a field called nickname

                    convo.on('end', function(convo) {
                        if (convo.status == 'completed') {
                            bot.reply(message, 'OK! I will update my dossier...');

                            controller.storage.users.get(message.user, function(err, user) {
                                if (!user) {
                                    user = {
                                        id: message.user,
                                    };
                                }
                                user.name = convo.extractResponse('nickname');
                                controller.storage.users.save(user, function(err, id) {
                                    bot.reply(message, 'Got it. I will call you ' + user.name + ' from now on.');
                                });
                            });



                        } else {
                            // this happens if the conversation ended prematurely for some reason
                            bot.reply(message, 'OK, nevermind!');
                        }
                    });
                }
            });
        }
    });
});


controller.hears(['shutdown'], 'direct_message,direct_mention,mention', function(bot, message) {

    bot.startConversation(message, function(err, convo) {

        convo.ask('Are you sure you want me to shutdown?', [{
                pattern: bot.utterances.yes,
                callback: function(response, convo) {
                    convo.say('Bye!');
                    convo.next();
                    setTimeout(function() {
                        process.exit();
                    }, 3000);
                }
            },
            {
                pattern: bot.utterances.no,
                default: true,
                callback: function(response, convo) {
                    convo.say('*Phew!*');
                    convo.next();
                }
            }
        ]);
    });
});


controller.hears(['uptime', 'identify yourself', 'who are you', 'what is your name'],
    'direct_message,direct_mention,mention',
    function(bot, message) {

        var hostname = os.hostname();
        var uptime = formatUptime(process.uptime());

        bot.reply(message,
            ':robot_face: I am a bot named <@' + bot.identity.name +
            '>. I have been running for ' + uptime + ' on ' + hostname + '.');

    });

function formatUptime(uptime) {
    var unit = 'second';
    if (uptime > 60) {
        uptime = uptime / 60;
        unit = 'minute';
    }
    if (uptime > 60) {
        uptime = uptime / 60;
        unit = 'hour';
    }
    if (uptime != 1) {
        unit = unit + 's';
    }

    uptime = uptime + ' ' + unit;
    return uptime;
}

controller.hears(['(.*)が無くなった', '(.*)がなくなった', '(.*)が切れた', '(.*)を買う', '(.*)が欲しい', '(.*)がほしい'], 'direct_message,direct_mention,mention', function(bot, message) {
    var thing = message.match[1];
    controller.storage.teams.get(message.team, function(err, user) {
        if (!user) {
            user = {
                id: message.team,
            };
        }

        if (thing == null || thing == '') {
            bot.reply(message, '買うものが入力されていません');
        } else {
            if (!user.purchase) {
                var newlist = [];
                newlist.push(thing);
                user.purchase = newlist;
                console.log(newlist);
                controller.storage.teams.save(user, function(err, id) {
                    bot.reply(message, thing + ' を購入物リストに追加しました');
                });
            } else {
                oldlist = user.purchase;
                if (oldlist.indexOf(thing) < 0) {
                    oldlist.push(thing);
                    console.log(oldlist);
                    user.purchase = oldlist;
                    controller.storage.teams.save(user, function(err, id) {
                        bot.reply(message, thing + ' を購入物リストに追加しました');
                    });
                } else {
                    bot.reply(message, thing + ' はすでに購入物リストに入っています');
                }
            }
        }
    });
});

controller.hears(['買うもの', '購入物', 'リスト'], 'direct_message,direct_mention,mention', function(bot, message) {
    controller.storage.teams.get(message.team, function(err, user) {
        if (!user) {
            user = {
                id: message.team,
            };
        }
        if (!user.purchase || (user.purchase.length == 0)) {
            bot.reply(message, '購入物リストに何も入っていません');
        } else {
            var list = [];
            list = user.purchase;
            var str = list.join('\n');
            bot.reply(message, '購入物リストには以下のものがあります\n' + str);
        }
    });
});

controller.hears(['全部買った'], 'direct_message,direct_mention,mention', function(bot, message) {
    controller.storage.teams.get(message.team, function(err, user) {
        if (!user) {
            user = {
                id: message.team,
            };
        }
        if (!user.purchase || (user.purchase.length == 0)) {
            bot.reply(message, '購入物リストに何も入っていません');
        } else {
            var list = [];
            list = user.purchase;
            list.splice(0, list.length);
            controller.storage.teams.save(user, function(err, id) {
                bot.reply(message, '購入物リストを空にしました');
            });
        }
    });
});

controller.hears(['(.*)を買った'], 'direct_message,direct_mention,mention', function(bot, message) {
    var thing = message.match[1];
    controller.storage.teams.get(message.team, function(err, user) {
        if (!user) {
            user = {
                id: message.team,
            };
        }

        if (thing == null || thing == '') {
            bot.reply(message, '買ったものが入力されていません');
        } else {
            if (!user.purchase || (user.purchase.length == 0)) {
                bot.reply(message, '購入物リストに何も入っていません');
            } else {
                var list = [];
                list = user.purchase;
                var str = list.join('\n');
                var p;
                if ((p = list.indexOf(thing)) >= 0) {
                    console.log(p);
                    list.splice(p, 1);
                    console.log(list);
                    user.purchase = list;
                    controller.storage.teams.save(user, function(err, id) {
                        bot.reply(message, thing + ' を購入物リストから削除しました');
                    });
                } else {
                    bot.reply(message, thing + ' は購入物リストに入っていません\n購入物リストには以下のものがあります\n' + str);
                }
            }
        }
    });
});

//(論文検索)
controller.hears(['(.*)の論文(.*)'], 'direct_message,direct_mention,mention', function(bot, message) {
    var thing = message.match[1];
    if (thing == null || thing == '') {
        bot.reply(message, '調べる論文のジャンルが入力されていません');
    } else {
        var count = parseInt(message.match[2], 10);
        var request = require('sync-request');
        var DOMParser = require('xmldom').DOMParser;

        if (isNaN(count)) { //個数指定があるかどうかの判定
            size = 3;
        } else {
            size = count;
        }

        if (isAlphabetNumeric(thing) == true) {
            var url = "http://export.arxiv.org/api/query?search_query=all:%22" + thing + "%22&start=0&max_results=" + String(size) + "&sortBy=submittedDate&sortOrder=descending";
            console.log(url);
            var res = request('GET', url);

            if (res.statusCode == 200) {
                body = res.getBody('utf-8')
                var parser = new DOMParser();
                xmlDoc = parser.parseFromString(body, 'text/xml');
                var p = new Promise(function(res) {
                    res();
                });
                for (var i = 0; i < size; i++) {
                    try {
                        var arxiv_id = xmlDoc.getElementsByTagName('feed')[0].getElementsByTagName('entry')[i].getElementsByTagName('id')[0].textContent;
                        var title = xmlDoc.getElementsByTagName('feed')[0].getElementsByTagName('entry')[i].getElementsByTagName('title')[0].textContent;
                        var published = xmlDoc.getElementsByTagName('feed')[0].getElementsByTagName('entry')[i].getElementsByTagName('published')[0].textContent;
                        var summary = xmlDoc.getElementsByTagName('feed')[0].getElementsByTagName('entry')[i].getElementsByTagName('summary')[0].textContent;
                        var url = xmlDoc.getElementsByTagName('feed')[0].getElementsByTagName('entry')[i].getElementsByTagName('link')[0].textContent;
                    } catch (e) {
                        continue;
                    }
                    bot.reply(message, "こんな論文が見つかりました!!\n\"" + title + "\"\n" + arxiv_id);
                    console.log(title + "\n" + arxiv_id);
                    //p = p.then(makePromiseFunc2InsertPaper(arxiv_id, title, published, summary, xmlDoc, i));
                }
            }
        } else {
            var url = "http://ci.nii.ac.jp/opensearch/search?q=" + encodeURIComponent(thing) + "&count=" + String(size) + "&format=atom";
            console.log(url);
            var res = request('GET', url);

            if (res.statusCode == 200) {
                body = res.getBody('utf-8')
                var parser = new DOMParser();
                xmlDoc = parser.parseFromString(body, 'text/xml');
                var p = new Promise(function(res) {
                    res();
                });
                for (var i = 0; i < size; i++) {
                    try {
                        var arxiv_id = xmlDoc.getElementsByTagName('feed')[0].getElementsByTagName('entry')[i].getElementsByTagName('id')[0].textContent;
                        var title = xmlDoc.getElementsByTagName('feed')[0].getElementsByTagName('entry')[i].getElementsByTagName('title')[0].textContent;
                        var published = xmlDoc.getElementsByTagName('feed')[0].getElementsByTagName('entry')[i].getElementsByTagName('prism:publicationDate')[0].textContent;
                    } catch (e) {
                        continue;
                    }
                    bot.reply(message, "こんな論文が見つかりました!!\n\"" + title + "\"\n" + arxiv_id);
                    console.log(title + "\n" + arxiv_id);
                    //p = p.then(makePromiseFunc2InsertPaper(arxiv_id, title, published, summary, xmlDoc, i));
                }
            }
        }
    }
});

/**
 * チェック対象文字列が半角英数字のみかチェックします。
 *
 * @param argValue チェック対象文字列
 * @return 全て半角英数字の場合はtrue、
 * 半角英数字以外の文字が含まれている場合はfalse
 */
function isAlphabetNumeric(argValue) {
    if (argValue.match(/[^A-Z|^a-z|^0-9]/g)) {
        return false;
    } else {
        return true;
    }
}

//書き言葉変換(ですます体→だである体)
controller.hears(['書き言葉変換:(.*)'], 'direct_message,direct_mention,mention', function(bot, message) {
  var thing = message.match[1];
  if(thing==null||thing==''){
            bot.reply(message,'変換する文章が入力されていません');
          }

        else{
          search_array1=new Array("しないで","ないで","なくて","くて","ています","んです","でしょう","でも","ましょう","なきゃ","やっぱり","全然","じゃありません","じゃな",);
          trans_array1=new Array("せず","ず","なく","く","ている","のだ","だろう","しかし","よう","なければ","やはり","全く","ではありません","ではな");　　　

          search_array2=new Array("ていません","けど","だから","どうして","なんで","どんな","どっち","だけど","ですから","とか","いろんな","みたい");
          trans_array2=new Array("ていない","が","従って","なぜ","なぜ","どのような","どちら","だが","そのため","や","様々な","のよう");　　　



          var trans_str=thing;
          var search_check=0;
          var loopnum=0;
          //console.log(thing);
          //console.log(trans_str);
          for(loopnum=0;loopnum<search_array1.length;loopnum++){
            search_check=trans_str.indexOf(search_array1[loopnum]);
            console.log(search_check);
            while(search_check!=-1){
            trans_str=trans_str.replace(search_array1[loopnum],trans_array1[loopnum]);
            console.log(trans_str);
            search_check=-1;
            //search_check=trans_str.indexOf(search_array[loopnum]);
              }
          }

          loopnum=0;

          for(loopnum=0;loopnum<search_array2.length;loopnum++){
            search_check=trans_str.indexOf(search_array2[loopnum]);
            console.log(search_check);
            while(search_check!=-1){
            trans_str=trans_str.replace(search_array2[loopnum],trans_array2[loopnum]);
            console.log(trans_str);
            search_check=-1;
            //search_check=trans_str.indexOf(search_array[loopnum]);
              }
          }

          console.log(trans_str);
          bot.reply(message,trans_str);
        }
});

controller.hears(['(.*)鍵(.*)', '(.*)電気(.*)'], 'direct_message,direct_mention,mention', function(bot, message) {
    if (is_open) {
        if (is_light) {
            bot.reply(message, "鍵は開いていて電気もついています．\n誰かいるのでしょうか");
        } else {
            bot.reply(message, "鍵は開いてますが電気はついていません．\n鍵の閉め忘れでなければいいのですが…");
        }
    } else {
        if (is_light) {
            bot.reply(message, "鍵は閉まっていますが電気はついています．\n電気の消し忘れでなければいいのですが…");
        } else {
            bot.reply(message, "鍵は閉まっていて電気も消えています．");
        }
    }

});

controller.hears(['ヘルプ', '機能', '使い方'], 'direct_message,direct_mention,mention', function(bot, message) {
    bot.reply(message, "「鍵」：研究室の鍵が開いているか，電気がついているかを答えます\n" +
        "「～が無くなった」,「～が切れた」：購入物リストに～を追加します\n" +
        "「～を買った」：購入物リストから～を削除します\n" +
        "「全部買った」：購入物リストを空にします\n" +
        "「買うもの」,「購入物」,「リスト」：購入物リストを確認できます\n" +
        "「～の論文X」：～に関する論文をX個検索します．Xを省略した場合は3つ検索します\n" +
        "～部分を英数字のみにすると英語論文，それ以外の文字を混ぜると日本語論文を検索します\n" +
        "「しりとり」：しりとりを始めます．しりとりを終了したいときは「終わり」と言ってください．");
});

var context = '';
var mode = 'dialog';
var place = '京都';

controller.hears('', 'direct_message,direct_mention,mention', function(bot, message) {

    //  bot.startConversation(message, function(err, convo) {
    var options = {
        url: 'https://api.apigw.smt.docomo.ne.jp/dialogue/v1/dialogue?APIKEY=' + process.env.apikey,
        json: {
            utt: message.text,
            place: place,

            // 以下2行はしりとり以外の会話はコメントアウトいいかも
            // 会話を継続しているかの情報
            context: context,
            mode: mode
        }
    }

    //リクエスト送信
    request.post(options, function(error, response, body) {
        context = body.context;
        mode = body.mode;

        bot.reply(message, body.utt);
    })
    //convo.next();
    //  });
});
