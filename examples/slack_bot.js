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

board.on("ready", function() {
    // スイッチの設定
    button = new five.Button({
        // デジタル2番ピンにスイッチを接続
        pin: 5,
        // Arduinoに内蔵されているプルアップ回路を有効
        isPullup: false
    });

    // スイッチを追加(アクセス許可)
    board.repl.inject({
        button: button
    });

    // スイッチを押した
    button.on("down", function() {
        console.log("HIGH");
    });

    // スイッチを押し続けて一定時間(初期設定では500ms)経過した
    button.on("hold", function() {
        console.log("HOLD");
        is_open = false;
    });

    // スイッチを離した
    button.on("up", function() {
        console.log("LOW");
        is_open = true;
    });
});

////////////////////////////////////////////

var controller = Botkit.slackbot({
    json_file_store: 'storage_bot_db'
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

controller.hears(['(.*)が無くなった', '(.*)がなくなった', '(.*)が切れた', '(.*)を買う'], 'direct_message,direct_mention,mention', function(bot, message) {
    var thing = message.match[1];
    controller.storage.users.get(message.user, function(err, user) {
        if (!user) {
            user = {
                id: message.user,
            };
        }

        if (!user.purchase) {
            var newlist = [];
            newlist.push(thing);
            user.purchase = newlist;
            console.log(newlist);
            controller.storage.users.save(user, function(err, id) {
                bot.reply(message, thing + ' を購入物リストに追加しました');
            });
        } else {
            oldlist = user.purchase;
            if (oldlist.indexOf(thing) < 0) {
                oldlist.push(thing);
                console.log(oldlist);
                user.purchase = oldlist;
                controller.storage.users.save(user, function(err, id) {
                    bot.reply(message, thing + ' を購入物リストに追加しました');
                });
            } else {
                bot.reply(message, thing + ' はすでに購入物リストに入っています');
            }
        }
    });
});

controller.hears(['買うもの', '購入物', 'リスト'], 'direct_message,direct_mention,mention', function(bot, message) {
    controller.storage.users.get(message.user, function(err, user) {
        if (!user) {
            user = {
                id: message.user,
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
    controller.storage.users.get(message.user, function(err, user) {
        if (!user) {
            user = {
                id: message.user,
            };
        }
        if (!user.purchase || (user.purchase.length == 0)) {
            bot.reply(message, '購入物リストに何も入っていません');
        } else {
            var list = [];
            list = user.purchase;
            list.splice(0, list.length);
            controller.storage.users.save(user, function(err, id) {
                bot.reply(message, '購入物リストを空にしました');
            });
        }
    });
});

controller.hears(['(.*)を買った'], 'direct_message,direct_mention,mention', function(bot, message) {
    var thing = message.match[1];
    controller.storage.users.get(message.user, function(err, user) {
        if (!user) {
            user = {
                id: message.user,
            };
        }
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
                controller.storage.users.save(user, function(err, id) {
                    bot.reply(message, thing + ' を購入物リストから削除しました');
                });
            } else {
                bot.reply(message, thing + ' は購入物リストに入っていません\n購入物リストには以下のものがあります\n' + str);
            }
        }
    });
});

controller.hears(['(.*)鍵(.*)'], 'direct_message,direct_mention,mention', function(bot, message) {
    if (is_open) {
        bot.reply(message, "あいてるよ！！誰がいるのかな(ﾜｸﾜｸ");
    } else {
        bot.reply(message, "しまってるよ( ;∀;)");
    }

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

// controller.hears('しりとり(.*)', 'direct_message,direct_mention,mention', function(bot, message) {
//
//   var options = {
//       url: 'https://api.apigw.smt.docomo.ne.jp/dialogue/v1/dialogue?APIKEY=' + process.env.apikey,
//       json: {
//           utt: message.text,
//           place: place,
//
//           // 以下2行はしりとり以外の会話はコメントアウトいいかも
//           // 会話を継続しているかの情報
//           context: context,
//           mode: mode
//       }
//   }
//   request.post(options, function (error, response, body) {
//       context = body.context;
//       mode = body.mode;
//       bot.reply(message, body.utt);
//   })
//
//    bot.startConversation(message, function(err, convo) {
//         convo.ask('答えをどうぞ',
//         function(response,convo){
//             //リクエスト送信
//             request.post(options, function (error, response, body) {
//                 context = body.context;
//                 //mode = 'srtr';
//                 convo.say(body.utt);
//                 convo.next();
//                   //bot.reply(message, body.utt);
//             });
//           });
//       });
// });
