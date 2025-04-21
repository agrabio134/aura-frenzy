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
  foods: [],
  bushes: [],
  leaderboard: []
};

const botNames = ["Mosim", "Rober", "Ho", "Kuba", "Pelot", "Wetefec"];

function initializeGame() {
  for (let i = 0; i < 10; i++) {
    gameState.bots.push({
      id: `bot_${i}`,
      name: `${botNames[i % botNames.length]}${i}`,
      pos: { x: Math.random() * WORLD_WIDTH, y: Math.random() * WORLD_HEIGHT },
      r: 15,
      vel: { x: 0, y: 0 },
      target: { x: Math.random() * WORLD_WIDTH, y: Math.random() * WORLD_HEIGHT }
    });
  }
  for (let i = 0; i < 1000; i++) {
    gameState.foods.push({
      pos: { x: Math.random() * WORLD_WIDTH, y: Math.random() * WORLD_HEIGHT },
      r: 5
    });
  }
  for (let i = 0; i < 20; i++) {
    gameState.bushes.push({
      pos: { x: Math.random() * WORLD_WIDTH, y: Math.random() * WORLD_HEIGHT },
      r: 30
    });
  }
}

function distance(p1, p2) {
  if (!p1 || !p2 || !p1.pos || !p2.pos || typeof p1.pos.x !== 'number' || typeof p2.pos.x !== 'number') {
    console.warn('Invalid distance calculation:', { p1, p2 });
    return Infinity; // Skip collision check for invalid objects
  }
  return Math.sqrt((p1.pos.x - p2.pos.x) ** 2 + (p1.pos.y - p2.pos.y) ** 2);
}

initializeGame();

io.on('connection', (socket) => {
  console.log(`Player connected: ${socket.id}`);

  socket.on('playerJoin', (name) => {
    gameState.players[socket.id] = {
      pos: { x: WORLD_WIDTH / 2, y: WORLD_HEIGHT / 2 },
      r: 20,
      vel: { x: 0, y: 0 },
      name: name || `Player_${socket.id.slice(0, 4)}`,
      speedBoostActive: false,
      speedBoostCooldown: 0,
      speedBoostTimer: 0,
      isActive: true
    };
    socket.emit('gameState', gameState);
  });

  socket.on('playerInput', (input) => {
    if (gameState.players[socket.id] && gameState.players[socket.id].isActive) {
      let player = gameState.players[socket.id];
      let speedMultiplier = player.speedBoostActive ? 1.8 : 1;

      if (input.speedBoost && !player.speedBoostActive && player.speedBoostCooldown <= 0) {
        player.speedBoostActive = true;
        player.speedBoostTimer = 180;
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
  // Process players
  for (let id in gameState.players) {
    let player = gameState.players[id];
    if (!player || !player.pos || !player.isActive) continue; // Skip invalid or inactive players

    player.pos.x += player.vel.x;
    player.pos.y += player.vel.y;
    player.pos.x = Math.max(player.r, Math.min(WORLD_WIDTH - player.r, player.pos.x));
    player.pos.y = Math.max(player.r, Math.min(WORLD_HEIGHT - player.r, player.pos.y));

    if (player.speedBoostActive) {
      player.speedBoostTimer--;
      if (player.speedBoostTimer <= 0) {
        player.speedBoostActive = false;
        player.speedBoostCooldown = 600;
      }
    } else if (player.speedBoostCooldown > 0) {
      player.speedBoostCooldown--;
    }

    // Check food collisions
    for (let i = gameState.foods.length - 1; i >= 0; i--) {
      let food = gameState.foods[i];
      if (!food || !food.pos) {
        gameState.foods.splice(i, 1); // Remove invalid food
        continue;
      }
      if (distance(player, food) < player.r + food.r) {
        let area = Math.PI * player.r ** 2 + Math.PI * food.r ** 2;
        player.r = Math.sqrt(area / Math.PI);
        gameState.foods.splice(i, 1);
        gameState.foods.push({
          pos: { x: Math.random() * WORLD_WIDTH, y: Math.random() * WORLD_HEIGHT },
          r: 5
        });
      }
    }

    // Check bot collisions (player eats bot)
    for (let i = gameState.bots.length - 1; i >= 0; i--) {
      let bot = gameState.bots[i];
      if (!bot || !bot.pos) {
        gameState.bots.splice(i, 1); // Remove invalid bot
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
          target: { x: Math.random() * WORLD_WIDTH, y: Math.random() * WORLD_HEIGHT }
        });
      }
    }

    // Check player collisions (player eats another player)
    for (let otherId in gameState.players) {
      if (otherId !== id && gameState.players[otherId]?.isActive) {
        let otherPlayer = gameState.players[otherId];
        if (!otherPlayer || !otherPlayer.pos) continue; // Skip invalid players
        if (player.r > otherPlayer.r * 1.1 && distance(player, otherPlayer) < player.r + otherPlayer.r) {
          let area = Math.PI * player.r ** 2 + Math.PI * otherPlayer.r ** 2;
          player.r = Math.sqrt(area / Math.PI);
          otherPlayer.isActive = false; // Mark as inactive
          io.to(otherId).emit('eaten', { eater: player.name });
          delete gameState.players[otherId]; // Remove eaten player
          console.log(`Player eaten: ${otherId} by ${player.name}`);
        }
      }
    }
  }

  // Process bots (including bots eating players)
  for (let bot of gameState.bots) {
    if (!bot || !bot.pos) continue; // Skip invalid bots

    let nearestFood = null;
    let minDist = Infinity;
    for (let food of gameState.foods) {
      if (!food || !food.pos) continue;
      let d = distance(bot, food);
      if (d < minDist) {
        minDist = d;
        nearestFood = food;
      }
    }
    if (nearestFood && minDist < 200) {
      bot.target = nearestFood.pos;
    } else {
      // Calculate distance to target directly
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
      dirX = (dirX / mag) * (2 / Math.sqrt(bot.r));
      dirY = (dirY / mag) * (2 / Math.sqrt(bot.r));
    }
    bot.vel.x = dirX;
    bot.vel.y = dirY;
    bot.pos.x += bot.vel.x;
    bot.pos.y += bot.vel.y;
    bot.pos.x = Math.max(bot.r, Math.min(WORLD_WIDTH - bot.r, bot.pos.x));
    bot.pos.y = Math.max(bot.r, Math.min(WORLD_HEIGHT - bot.r, bot.pos.y));

    // Bot eats food
    for (let i = gameState.foods.length - 1; i >= 0; i--) {
      let food = gameState.foods[i];
      if (!food || !food.pos) {
        gameState.foods.splice(i, 1);
        continue;
      }
      if (distance(bot, food) < bot.r + food.r) {
        let area = Math.PI * bot.r ** 2 + Math.PI * food.r ** 2;
        bot.r = Math.sqrt(area / Math.PI);
        gameState.foods.splice(i, 1);
        gameState.foods.push({
          pos: { x: Math.random() * WORLD_WIDTH, y: Math.random() * WORLD_HEIGHT },
          r: 5
        });
      }
    }

    // Bot eats players
    for (let id in gameState.players) {
      let player = gameState.players[id];
      if (!player || !player.pos || !player.isActive) continue;
      if (bot.r > player.r * 1.1 && distance(bot, player) < bot.r + player.r) {
        let area = Math.PI * bot.r ** 2 + Math.PI * player.r ** 2;
        bot.r = Math.sqrt(area / Math.PI);
        player.isActive = false; // Mark as inactive
        io.to(id).emit('eaten', { eater: bot.name });
        delete gameState.players[id]; // Remove eaten player
        console.log(`Player eaten: ${id} by ${bot.name}`);
      }
    }
  }

  // Update leaderboard
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