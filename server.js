const express = require('express');
const app = express();
const server = require('http').createServer(app);
const io = require('socket.io')(server);

app.use(express.static('public'));

const WORLD_WIDTH = 4000;
const WORLD_HEIGHT = 4000;

let gameState = {
  players: {},
  bots: [],
  debris: [],
  pipes: [],
  clogZones: [],
  leaderboard: []
};

const botNames = ["Clog", "Drip", "Splat", "Flush", "Gurgle", "Plumb"];
const colors = ['#F5F5F5', '#40C4FF', '#26A69A'];
const accessories = ['🪠', '🧹', '🧻'];

function initializeGame() {
  for (let i = 0; i < 10; i++) {
    gameState.bots.push({
      id: `bot_${i}`,
      name: `${botNames[i % botNames.length]}${i}`,
      pos: { x: Math.random() * WORLD_WIDTH, y: Math.random() * WORLD_HEIGHT },
      r: 15,
      vel: { x: 0, y: 0 },
      target: { x: Math.random() * WORLD_WIDTH, y: Math.random() * WORLD_HEIGHT },
      inClogZone: false,
      avatar: {
        color: colors[Math.floor(Math.random() * colors.length)],
        accessory: accessories[Math.floor(Math.random() * accessories.length)]
      }
    });
  }
  for (let i = 0; i < 1000; i++) {
    gameState.debris.push({
      pos: { x: Math.random() * WORLD_WIDTH, y: Math.random() * WORLD_HEIGHT },
      r: 5
    });
  }
  for (let i = 0; i < 20; i++) {
    gameState.pipes.push({
      pos: { x: Math.random() * WORLD_WIDTH, y: Math.random() * WORLD_HEIGHT },
      r: 30
    });
  }
  for (let i = 0; i < 5; i++) {
    gameState.clogZones.push({
      pos: { x: Math.random() * WORLD_WIDTH, y: Math.random() * WORLD_HEIGHT },
      r: 100
    });
  }
}

function distance(p1, p2) {
  if (!p1 || !p2 || !p1.pos || !p2.pos || typeof p1.pos.x !== 'number' || typeof p2.pos.x !== 'number') {
    console.warn('Invalid distance calculation:', { p1, p2 });
    return Infinity;
  }
  return Math.sqrt((p1.pos.x - p2.pos.x) ** 2 + (p1.pos.y - p2.pos.y) ** 2);
}

initializeGame();

io.on('connection', (socket) => {
  console.log(`Player connected: ${socket.id}`);

  socket.on('playerJoin', (data) => {
    gameState.players[socket.id] = {
      pos: { x: WORLD_WIDTH / 2, y: WORLD_HEIGHT / 2 },
      r: 20,
      vel: { x: 0, y: 0 },
      name: data.name || `Plumber_${socket.id.slice(0, 4)}`,
      flushBoostActive: false,
      flushBoostCooldown: 0,
      flushBoostTimer: 0,
      inClogZone: false,
      unclogTimer: 0,
      isActive: true,
      avatar: data.avatar || { color: '#F5F5F5', accessory: '🪠' }
    };
    socket.emit('gameState', gameState);
  });

  socket.on('playerInput', (input) => {
    if (gameState.players[socket.id] && gameState.players[socket.id].isActive) {
      let player = gameState.players[socket.id];
      let speedMultiplier = player.inClogZone ? 0.5 : 1;
      if (player.flushBoostActive) {
        speedMultiplier *= 1.8;
      }

      if (input.flushBoost && !player.flushBoostActive && player.flushBoostCooldown <= 0) {
        player.flushBoostActive = true;
        player.flushBoostTimer = 180;
      }

      if (input.joystick) {
        let dirX = input.joystick.x * 5;
        let dirY = input.joystick.y * 5;
        let mag = Math.sqrt(dirX ** 2 + dirY ** 2);
        if (mag > 0) {
          dirX = (dirX / mag) * (3.6 * speedMultiplier / Math.sqrt(player.r));
          dirY = (dirY / mag) * (3.6 * speedMultiplier / Math.sqrt(player.r));
        }
        player.vel.x = dirX;
        player.vel.y = dirY;
      } else if (input.mouse) {
        let dirX = input.mouse.x - player.pos.x;
        let dirY = input.mouse.y - player.pos.y;
        let mag = Math.sqrt(dirX ** 2 + dirY ** 2);
        if (mag > 0) {
          dirX = (dirX / mag) * (3.6 * speedMultiplier / Math.sqrt(player.r));
          dirY = (dirY / mag) * (3.6 * speedMultiplier / Math.sqrt(player.r));
        }
        player.vel.x = dirX;
        player.vel.y = dirY;
      }
    }
  });

  socket.on('disconnect', () => {
    console.log(`Player disconnected: ${socket.id}`);
    delete gameState.players[socket.id];
  });
});

setInterval(() => {
  for (let zone of gameState.clogZones) {
    if (Math.random() < 0.0167) {
      let x = zone.pos.x + (Math.random() * zone.r * 2 - zone.r);
      let y = zone.pos.y + (Math.random() * zone.r * 2 - zone.r);
      if (distance({ pos: { x, y } }, zone) < zone.r) {
        gameState.debris.push({
          pos: { x, y },
          r: 5
        });
      }
    }
  }

  for (let id in gameState.players) {
    let player = gameState.players[id];
    if (!player || !player.pos || !player.isActive) continue;

    player.inClogZone = false;
    for (let zone of gameState.clogZones) {
      if (distance(player, zone) < zone.r) {
        player.inClogZone = true;
        player.unclogTimer++;
        if (player.unclogTimer >= 600) {
          player.r += 10;
          gameState.clogZones.splice(gameState.clogZones.indexOf(zone), 1);
          gameState.clogZones.push({
            pos: { x: Math.random() * WORLD_WIDTH, y: Math.random() * WORLD_HEIGHT },
            r: 100
          });
          player.unclogTimer = 0;
        }
        break;
      }
    }
    if (!player.inClogZone) player.unclogTimer = 0;

    player.pos.x += player.vel.x;
    player.pos.y += player.vel.y;
    player.pos.x = Math.max(player.r, Math.min(WORLD_WIDTH - player.r, player.pos.x));
    player.pos.y = Math.max(player.r, Math.min(WORLD_HEIGHT - player.r, player.pos.y));

    if (player.flushBoostActive) {
      player.flushBoostTimer--;
      if (player.flushBoostTimer <= 0) {
        player.flushBoostActive = false;
        player.flushBoostCooldown = 600;
      }
    } else if (player.flushBoostCooldown > 0) {
      player.flushBoostCooldown--;
    }

    for (let i = gameState.debris.length - 1; i >= 0; i--) {
      let d = gameState.debris[i];
      if (!d || !d.pos) {
        gameState.debris.splice(i, 1);
        continue;
      }
      if (distance(player, d) < player.r + d.r) {
        let area = Math.PI * player.r ** 2 + Math.PI * d.r ** 2;
        player.r = Math.sqrt(area / Math.PI);
        gameState.debris.splice(i, 1);
        gameState.debris.push({
          pos: { x: Math.random() * WORLD_WIDTH, y: Math.random() * WORLD_HEIGHT },
          r: 5
        });
      }
    }

    for (let i = gameState.bots.length - 1; i >= 0; i--) {
      let bot = gameState.bots[i];
      if (!bot || !bot.pos) {
        gameState.bots.splice(i, 1);
        continue;
      }
      if (player.r > bot.r * 1.1 && distance(player, bot) < player.r + bot.r) {
        let area = Math.PI * player.r ** 2 + Math.PI * bot.r ** 2;
        player.r = Math.sqrt(area / Math.PI);
        gameState.bots.splice(i, 1);
        gameState.bots.push({
          id: `bot_${i}`,
          name: `${botNames[i % botNames.length]}${i}`,
          pos: { x: Math.random() * WORLD_WIDTH, y: Math.random() * WORLD_HEIGHT },
          r: 15,
          vel: { x: 0, y: 0 },
          target: { x: Math.random() * WORLD_WIDTH, y: Math.random() * WORLD_HEIGHT },
          inClogZone: false,
          avatar: {
            color: colors[Math.floor(Math.random() * colors.length)],
            accessory: accessories[Math.floor(Math.random() * accessories.length)]
          }
        });
      }
    }

    for (let otherId in gameState.players) {
      if (otherId !== id && gameState.players[otherId]?.isActive) {
        let otherPlayer = gameState.players[otherId];
        if (!otherPlayer || !otherPlayer.pos) continue;
        if (player.r > otherPlayer.r * 1.1 && distance(player, otherPlayer) < player.r + otherPlayer.r) {
          let area = Math.PI * player.r ** 2 + Math.PI * otherPlayer.r ** 2;
          player.r = Math.sqrt(area / Math.PI);
          otherPlayer.isActive = false;
          io.to(otherId).emit('flushed', { flusher: player.name });
          delete gameState.players[otherId];
          console.log(`Player flushed: ${otherId} by ${player.name}`);
        }
      }
    }
  }

  for (let bot of gameState.bots) {
    if (!bot || !bot.pos) continue;

    bot.inClogZone = false;
    for (let zone of gameState.clogZones) {
      if (distance(bot, zone) < zone.r) {
        bot.inClogZone = true;
        break;
      }
    }

    let nearestDebris = null;
    let minDist = Infinity;
    for (let d of gameState.debris) {
      if (!d || !d.pos) continue;
      let dist = distance(bot, d);
      if (dist < minDist) {
        minDist = dist;
        nearestDebris = d;
      }
    }
    if (nearestDebris && minDist < 200) {
      bot.target = nearestDebris.pos;
    } else {
      let dx = bot.pos.x - bot.target.x;
      let dy = bot.pos.y - bot.target.y;
      if (Math.sqrt(dx * dx + dy * dy) < 50) {
        bot.target = { x: Math.random() * WORLD_WIDTH, y: Math.random() * WORLD_HEIGHT };
      }
    }
    let dirX = bot.target.x - bot.pos.x;
    let dirY = bot.target.y - bot.pos.y;
    let mag = Math.sqrt(dirX ** 2 + dirY ** 2);
    if (mag > 0) {
      let speedMultiplier = bot.inClogZone ? 0.5 : 1;
      dirX = (dirX / mag) * (2 * speedMultiplier / Math.sqrt(bot.r));
      dirY = (dirY / mag) * (2 * speedMultiplier / Math.sqrt(bot.r));
    }
    bot.vel.x = dirX;
    bot.vel.y = dirY;
    bot.pos.x += bot.vel.x;
    bot.pos.y += bot.vel.y;
    bot.pos.x = Math.max(bot.r, Math.min(WORLD_WIDTH - bot.r, bot.pos.x));
    bot.pos.y = Math.max(bot.r, Math.min(WORLD_HEIGHT - bot.r, bot.pos.y));

    for (let i = gameState.debris.length - 1; i >= 0; i--) {
      let d = gameState.debris[i];
      if (!d || !d.pos) {
        gameState.debris.splice(i, 1);
        continue;
      }
      if (distance(bot, d) < bot.r + d.r) {
        let area = Math.PI * bot.r ** 2 + Math.PI * d.r ** 2;
        bot.r = Math.sqrt(area / Math.PI);
        gameState.debris.splice(i, 1);
        gameState.debris.push({
          pos: { x: Math.random() * WORLD_WIDTH, y: Math.random() * WORLD_HEIGHT },
          r: 5
        });
      }
    }

    for (let id in gameState.players) {
      let player = gameState.players[id];
      if (!player || !player.pos || !player.isActive) continue;
      if (bot.r > player.r * 1.1 && distance(bot, player) < bot.r + player.r) {
        let area = Math.PI * bot.r ** 2 + Math.PI * player.r ** 2;
        bot.r = Math.sqrt(area / Math.PI);
        player.isActive = false;
        io.to(id).emit('flushed', { flusher: bot.name });
        delete gameState.players[id];
        console.log(`Player flushed: ${id} by ${bot.name}`);
      }
    }
  }

  gameState.leaderboard = [];
  for (let id in gameState.players) {
    if (gameState.players[id] && gameState.players[id].isActive) {
      gameState.leaderboard.push({ name: gameState.players[id].name, size: Math.floor(gameState.players[id].r) });
    }
  }
  for (let bot of gameState.bots) {
    if (bot) {
      gameState.leaderboard.push({ name: bot.name, size: Math.floor(bot.r) });
    }
  }
  gameState.leaderboard.sort((a, b) => b.size - a.size);
  gameState.leaderboard = gameState.leaderboard.slice(0, 5);

  io.emit('gameState', gameState);
}, 1000 / 60);

server.listen(3000, () => {
  console.log('Server running on port 3000');
});