document.addEventListener('DOMContentLoaded', () => {
    // Canvas setup
    const canvas = document.getElementById('gameCanvas');
    const ctx = canvas.getContext('2d');

    // Audio resources
    const sounds = {
        bump: new Audio('audio/bump1.mp3'),
        shoot: new Audio('audio/shoot.mp3'),
        explosion: new Audio('audio/explosion.mp3'),
        chime2: new Audio('audio/chime2.mp3'),
        gameover: new Audio('audio/gameover.mp3')
    };

    // Image resources
    const images = {
        background: loadImage('images/background.jpg'),
        player: loadImage('images/rocketjet1.png'),
        invaders: [
            loadImage('images/ufo.png'),
            loadImage('images/ufoFrame2.png'),
            loadImage('images/ufoFrame3.png')
        ],
        boss: loadImage('images/boss-ufo1.png'),
        explosionSheet: loadImage('images/explosion_spritesheet.png')
    };

    // Constants
    const CONFIG = {
        player: { width: 60, height: 60, speed: 5 },
        invader: { width: 75, height: 50, speedX: 2, speedY: 1, animSpeed: 80 },
        explosion: { spriteW: 64, spriteH: 64, frameCount: 8, animSpeed: 4 },
        invaderSpawnMs: 2000
    };

    // Game state
    const state = {
        frameCount: 0,
        score: 0,
        invaderScore: 0,
        isOver: false,
        bossSpawned: false,
        boss: null,
        animationId: null,
        spawnIntervalId: null
    };

    // Entities
    class Invader {
        constructor(x, y) {
            this.x = x;
            this.y = y;
            this.width = CONFIG.invader.width;
            this.height = CONFIG.invader.height;
            this.speedX = CONFIG.invader.speedX;
            this.speedY = CONFIG.invader.speedY;
            this.frameIndex = 0;
        }

        update(canvasWidth) {
            this.x += this.speedX;
            this.y += this.speedY;
            if (this.x + this.width > canvasWidth || this.x < 0) {
                this.speedX *= -1;
            }
        }

        draw(ctx, img) {
            ctx.drawImage(img, this.x, this.y, this.width, this.height);
        }
    }

    class Explosion {
        constructor(x, y) {
            this.x = x;
            this.y = y;
            this.frameIndex = 0;
            this.timer = 0;
            this.scale = 1; // allow scaled explosions
        }

        update(animSpeed) {
            this.timer++;
            if (this.timer % animSpeed === 0) this.frameIndex++;
        }

        draw(ctx, sheet, spriteW, spriteH) {
            const sx = this.frameIndex * spriteW;
            const drawW = Math.floor(spriteW * this.scale);
            const drawH = Math.floor(spriteH * this.scale);
            // center the scaled explosion around the original x,y
            const dx = this.x - Math.floor((drawW - spriteW) / 2);
            const dy = this.y - Math.floor((drawH - spriteH) / 2);
            ctx.drawImage(sheet, sx, 0, spriteW, spriteH, dx, dy, drawW, drawH);
        }
    }

    // Boss class - slides in from top, then slowly homes horizontally toward the player
    class Boss {
        constructor(canvasWidth, canvasHeight, img) {
            this.img = img;
            this.width = Math.floor(canvasWidth / 3);
            // try to preserve aspect ratio if available
            if (img && img.complete && img.naturalWidth) {
                this.height = Math.floor(this.width * (img.naturalHeight / img.naturalWidth));
            } else {
                this.height = Math.floor(this.width * 0.6);
            }
            this.x = (canvasWidth - this.width) / 2;
            this.y = -this.height; // start above the canvas
            this.targetY = Math.floor(canvasHeight * 0.12); // slide into view to this Y
            this.arrived = false;
        }

        update(player, canvasWidth) {
            if (!this.arrived) {
                // slide down into view
                this.y += 3; // slide speed
                if (this.y >= this.targetY) {
                    this.y = this.targetY;
                    this.arrived = true;
                }
            } else {
                // move slowly toward player's center in both axes
                const playerCenterX = player.x + player.width / 2;
                const playerCenterY = player.y + player.height / 2;
                const bossCenterX = this.x + this.width / 2;
                const bossCenterY = this.y + this.height / 2;
                const diffX = playerCenterX - bossCenterX;
                const diffY = playerCenterY - bossCenterY;
                // small factor for slow homing
                this.x += diffX * 0.01;
                this.y += diffY * 0.01;
                // clamp within canvas horizontally
                if (this.x < 0) this.x = 0;
                if (this.x + this.width > canvasWidth) this.x = canvasWidth - this.width;
            }
        }

        draw(ctx) {
            if (!this.img || !this.img.complete) return;
            ctx.drawImage(this.img, this.x, this.y, this.width, this.height);
        }
    }

    const player = {
        x: 0,
        y: 0,
        width: CONFIG.player.width,
        height: CONFIG.player.height,
        speed: CONFIG.player.speed
    };

    const lasers = [];
    const invaders = [];
    const explosions = [];
    const keys = {};

    // --- Input handling ---
    window.addEventListener('keydown', (e) => {
        if (!state.isOver) keys[e.key] = true;
    });

    window.addEventListener('keyup', (e) => {
        if (!state.isOver) {
            keys[e.key] = false;
            if (e.key === ' ') shoot();
        } else if (e.key === 'Enter') {
            reset();
        }
    });

    // --- Helpers ---
    function loadImage(src) {
        const img = new Image();
        img.src = src;
        return img;
    }

    function clampPlayerX() {
        const oldX = player.x;
        if (player.x < 0) player.x = 0;
        if (player.x + player.width > canvas.width) player.x = canvas.width - player.width;
        if (oldX !== player.x) {
            sounds.bump.currentTime = 0;
            sounds.bump.play();
        }
    }

    function drawBackground() {
        const bg = images.background;
        if (!bg.complete) return;
        const imgRatio = bg.width / bg.height;
        const canvasRatio = canvas.width / canvas.height;
        let drawW, drawH, x, y;
        if (imgRatio > canvasRatio) {
            drawH = canvas.height;
            drawW = drawH * imgRatio;
            x = (canvas.width - drawW) / 2;
            y = 0;
        } else {
            drawW = canvas.width;
            drawH = drawW / imgRatio;
            x = 0;
            y = (canvas.height - drawH) / 2;
        }
        ctx.drawImage(bg, x, y, drawW, drawH);
    }

    function drawPlayer() {
        const img = images.player;
        if (!img.complete) return;
        ctx.drawImage(img, player.x, player.y, player.width, player.height);
    }

    function drawScore() {
        ctx.fillStyle = 'white';
        ctx.font = '20px Arial';
        ctx.fillText(`Defender: ${state.score}`, 10, 25);
        ctx.fillText(`Invaders: ${state.invaderScore}`, 10, 50);
    }

    function drawGameOver() {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = 'white';
        ctx.textAlign = 'center';
        ctx.font = '50px Arial';
        ctx.fillText('GAME OVER', canvas.width / 2, canvas.height / 2 - 20);
        ctx.font = '25px Arial';
        ctx.fillText(`Defender Final Score: ${state.score}`, canvas.width / 2, canvas.height / 2 + 10);
        ctx.fillText(`Invaders Final Score: ${state.invaderScore}`, canvas.width / 2, canvas.height / 2 + 45);
        ctx.fillText('Press Enter to Play Again', canvas.width / 2, canvas.height / 2 + 70);
    }

    // --- Game logic ---
    function handlePlayerInput() {
        if (keys['ArrowLeft']) player.x -= player.speed;
        if (keys['ArrowRight']) player.x += player.speed;
        clampPlayerX();
    }

    function shoot() {
        const laser = { x: player.x + player.width / 2, y: player.y, width: 5, height: 15, speed: 7 };
        lasers.push(laser);
        sounds.shoot.currentTime = 0;
        sounds.shoot.play();
    }

    function updateAndDrawLasers() {
        for (let i = lasers.length - 1; i >= 0; i--) {
            const l = lasers[i];
            l.y -= l.speed;
            ctx.fillStyle = 'red';
            ctx.beginPath();
            ctx.arc(l.x, l.y, l.width, 0, Math.PI * 2);
            ctx.fill();
            if (l.y < 0) lasers.splice(i, 1);
        }
    }

    function spawnInvader() {
        if (state.isOver) return;
        const x = Math.random() * (canvas.width - CONFIG.invader.width);
        const y = -CONFIG.invader.height;
        invaders.push(new Invader(x, y));
    }

    function updateAndDrawInvaders() {
        const frame = Math.floor(state.frameCount / CONFIG.invader.animSpeed) % images.invaders.length;
        for (let i = invaders.length - 1; i >= 0; i--) {
            const inv = invaders[i];
            inv.frameIndex = frame;
            inv.update(canvas.width);
            inv.draw(ctx, images.invaders[frame]);
            if (inv.y > canvas.height) {
                // add to invaders score according to current frame (1/2/3)
                state.invaderScore += (inv.frameIndex + 1);
                // play chime to indicate invaders scored
                if (sounds.chime2) {
                    try {
                        sounds.chime2.currentTime = 0;
                        sounds.chime2.play();
                    } catch (e) {
                        // ignore play errors (e.g., not allowed until user gesture)
                    }
                }
                invaders.splice(i, 1);
            }
        }
    }

    function updateAndDrawBoss() {
        if (!state.bossSpawned || !state.boss) return;
        state.boss.update(player, canvas.width);
        state.boss.draw(ctx);
        // basic collision: if boss touches player vertically/horizontally -> game over
        const b = state.boss;
        if (player.x < b.x + b.width && player.x + player.width > b.x && player.y < b.y + b.height && player.y + player.height > b.y) {
            // Trigger the same gameover handling used in loop()
            state.isOver = true;
            cancelAnimationFrame(state.animationId);
            try {
                sounds.gameover.currentTime = 0;
                sounds.gameover.play();
            } catch (e) {
                // ignore play errors
            }
            clearInterval(state.spawnIntervalId);
            drawGameOver();
            return;
        }
    }

    function updateAndDrawExplosions() {
        for (let i = explosions.length - 1; i >= 0; i--) {
            const ex = explosions[i];
            ex.update(CONFIG.explosion.animSpeed);
            ex.draw(ctx, images.explosionSheet, CONFIG.explosion.spriteW, CONFIG.explosion.spriteH);
            if (ex.frameIndex >= CONFIG.explosion.frameCount) explosions.splice(i, 1);
        }
    }

    function checkCollisions() {
        // lasers vs invaders
        for (let i = lasers.length - 1; i >= 0; i--) {
            const l = lasers[i];
            for (let j = invaders.length - 1; j >= 0; j--) {
                const inv = invaders[j];
                if (l.x < inv.x + inv.width && l.x + l.width > inv.x && l.y < inv.y + inv.height && l.y + l.height > inv.y) {
                    // score based on invader frame
                    state.score += (inv.frameIndex + 1);
                    explosions.push(new Explosion(inv.x, inv.y));
                    sounds.explosion.currentTime = 0;
                    sounds.explosion.play();
                    invaders.splice(j, 1);
                    lasers.splice(i, 1);
                    break;
                }
            }

            // lasers vs boss (if present)
            if (state.bossSpawned && state.boss) {
                const b = state.boss;
                if (l.x < b.x + b.width && l.x + l.width > b.x && l.y < b.y + b.height && l.y + l.height > b.y) {
                    // hit the boss
                    b.hitCount = (b.hitCount || 0) + 1;
                    // remove the laser
                    lasers.splice(i, 1);
                    // optional: play a small hit sound (reuse explosion for now)
                    try {
                        sounds.explosion.currentTime = 0;
                        sounds.explosion.play();
                    } catch (e) {}
                    // if boss has been hit more than 9 times, destroy it
                    if (b.hitCount > 9) {
                        // create a large explosion at boss center
                        const ex = new Explosion(b.x + b.width / 2 - CONFIG.explosion.spriteW / 2, b.y + b.height / 2 - CONFIG.explosion.spriteH / 2);
                        ex.scale = 3;
                        explosions.push(ex);
                        // award player 100 points for destroying boss
                        state.score += 100;
                        // play main explosion sound
                        try {
                            sounds.explosion.currentTime = 0;
                            sounds.explosion.play();
                        } catch (e) {}
                        // remove boss immediately so it no longer interacts
                        state.boss = null;
                        state.bossSpawned = false;

                        // schedule full game over after the explosion animation finishes
                        const explosionDurationMs = CONFIG.explosion.frameCount * CONFIG.explosion.animSpeed * (1000 / 60); // approx ms based on frames at 60fps
                        setTimeout(() => {
                            state.isOver = true;
                            cancelAnimationFrame(state.animationId);
                            try {
                                sounds.gameover.currentTime = 0;
                                sounds.gameover.play();
                            } catch (e) {}
                            clearInterval(state.spawnIntervalId);
                            drawGameOver();
                        }, Math.max(300, explosionDurationMs));
                    }
                }
            }
        }

        // invaders vs player
        for (let i = invaders.length - 1; i >= 0; i--) {
            const inv = invaders[i];
            if (player.x < inv.x + inv.width && player.x + player.width > inv.x && player.y < inv.y + inv.height && player.y + player.height > inv.y) {
                state.isOver = true;
                break;
            }
        }
    }

    function clearCanvas() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    }

    function drawAll() {
        clearCanvas();
        drawBackground();
        drawScore();
        drawPlayer();
        updateAndDrawLasers();
        updateAndDrawInvaders();
        updateAndDrawExplosions();
    }

    function loop() {
        if (state.isOver) {
            cancelAnimationFrame(state.animationId);
            sounds.gameover.currentTime = 0;
            sounds.gameover.play();
            drawGameOver();
            clearInterval(state.spawnIntervalId);
            return;
        }

        state.frameCount++;
        handlePlayerInput();
        checkCollisions();
        // spawn boss when defender score passes threshold
        if (!state.bossSpawned && state.score > 9) {
            state.bossSpawned = true;
            state.boss = new Boss(canvas.width, canvas.height, images.boss);
        }
        drawAll();
        updateAndDrawBoss();
        state.animationId = requestAnimationFrame(loop);
    }

    function reset() {
        state.isOver = false;
        state.score = 0;
        state.invaderScore = 0;
        lasers.length = 0;
        invaders.length = 0;
        explosions.length = 0;
        state.bossSpawned = false;
        state.boss = null;
        player.x = (canvas.width - player.width) / 2;
        player.y = canvas.height - player.height - 20;
        state.spawnIntervalId = setInterval(spawnInvader, CONFIG.invaderSpawnMs);
        loop();
    }

    function onResize() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
        player.x = (canvas.width - player.width) / 2;
        player.y = canvas.height - player.height - 20;
        // if boss exists, update its width/height and reposition relative to new canvas
        if (state.boss) {
            state.boss.width = Math.floor(canvas.width / 3);
            if (images.boss && images.boss.complete && images.boss.naturalWidth) {
                state.boss.height = Math.floor(state.boss.width * (images.boss.naturalHeight / images.boss.naturalWidth));
            }
            state.boss.x = Math.min(state.boss.x, canvas.width - state.boss.width);
            state.boss.targetY = Math.floor(canvas.height * 0.12);
        }
        if (!state.isOver) drawAll(); else drawGameOver();
    }

    // --- Initialization ---
    const resourcesToLoad = [images.background, images.player, images.explosionSheet, images.boss, ...images.invaders];
    Promise.all(resourcesToLoad.map(img => new Promise(res => img.onload = res))).then(() => {
        onResize();
        state.spawnIntervalId = setInterval(spawnInvader, CONFIG.invaderSpawnMs);
        loop();
    });

    window.addEventListener('resize', onResize);
});
