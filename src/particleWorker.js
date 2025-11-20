// 粒子计算工作线程
class ParticleWorker {
    constructor() {
        this.hitEffects = [];
        this.ambientParticles = [];
    }

    initAmbient(count, width, height) {
        this.ambientParticles = [];
        for (let i = 0; i < count; i++) {
            this.ambientParticles.push({
                x: Math.random() * width,
                y: Math.random() * height,
                r: 1.5 + Math.random() * 2.5,
                alpha: 0.10 + Math.random() * 0.15,
                vx: (Math.random() - 0.5) * 0.15,
                vy: -0.05 - Math.random() * 0.35
            });
        }
    }

    updateAmbient(width, height) {
        for (const p of this.ambientParticles) {
            p.x += p.vx;
            p.y += p.vy;
            if (p.y < -10) {
                p.x = Math.random() * width;
                p.y = height + 10;
                p.vx = (Math.random() - 0.5) * 0.15;
                p.vy = -0.05 - Math.random() * 0.15;
                p.r = 1.5 + Math.random() * 2.5;
                p.alpha = 0.10 + Math.random() * 0.15;
            }
            if (p.x < -10 || p.x > width + 10) {
                p.vx *= -1;
            }
        }
        return this.ambientParticles;
    }

    createHit(x, y, color, laneWidth) {
        const particleCount = 30;
        const newParticles = [];

        for (let i = 0; i < particleCount; i++) {
            const angle = -Math.PI / 2 + (Math.random() - 0.5) * (Math.PI / 2);
            const base = 0.8;
            const speed = base * Math.sqrt(Math.random());
            const vx = Math.cos(angle) * speed * 0.8;
            const vy = Math.sin(angle) * speed;

            newParticles.push({
                x, y, vx, vy,
                life: 1.5,
                decay: 0.02 + Math.random() * 0.02,
                size: (laneWidth / 2 - 5) + Math.random() * 7,
                color
            });
        }

        newParticles.push({
            x, y, vx: -0.2, vy: 0,
            life: 10,
            decay: 0.6,
            size: Math.random() * 10,
            color,
            isExplosion: true
        });

        this.hitEffects.push(...newParticles);
    }

    updateHit(height) {
        const next = [];
        for (const e of this.hitEffects) {
            e.x += e.vx;
            e.y += e.vy;
            e.vy += 0.05;
            e.life -= e.decay;
            if (e.isExplosion) e.size *= 0.9;
            else e.size *= 0.93;

            if (e.life > 0 && e.y > 30 && e.y < height + 30) {
                next.push(e);
            }
        }
        this.hitEffects = next;
        return this.hitEffects;
    }
}

const worker = new ParticleWorker();

self.onmessage = function(e) {
    const { type, data } = e.data;

    switch(type) {
        case 'initAmbient':
            worker.initAmbient(data.count, data.width, data.height);
            self.postMessage({ type: 'ambientInit', data: worker.ambientParticles });
            break;

        case 'updateAmbient':
            const ambient = worker.updateAmbient(data.width, data.height);
            self.postMessage({ type: 'ambientUpdate', data: ambient });
            break;

        case 'createHit':
            worker.createHit(data.x, data.y, data.color, data.laneWidth);
            break;

        case 'updateHit':
            const hits = worker.updateHit(data.height);
            self.postMessage({ type: 'hitUpdate', data: hits });
            break;
    }
};
