// 粒子计算工作线程 - TypeScript版本

interface AmbientParticle {
    x: number;
    y: number;
    r: number;
    alpha: number;
    vx: number;
    vy: number;
}

interface HitEffectParticle {
    x: number;
    y: number;
    vx: number;
    vy: number;
    life: number;
    decay: number;
    size: number;
    color: string;
    isExplosion?: boolean;
}

interface WorkerMessage {
    type: 'initAmbient' | 'updateAmbient' | 'createHit' | 'updateHit' | 'hitCreate' | 'clearHit';
    data: any;
}

interface InitAmbientData {
    count: number;
    width: number;
    height: number;
}

interface UpdateAmbientData {
    width: number;
    height: number;
}

interface CreateHitData {
    x: number;
    y: number;
    color: string;
    laneWidth: number;
}

interface UpdateHitData {
    height: number;
}

class ParticleWorker {
    private hitEffects: HitEffectParticle[] = [];
    private ambientParticles: AmbientParticle[] = [];

    initAmbient(count: number, width: number, height: number): void {
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

    updateAmbient(width: number, height: number): AmbientParticle[] {
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

    createHit(x: number, y: number, color: string, laneWidth: number): HitEffectParticle[] {
        const particleCount = 30;
        const newParticles: HitEffectParticle[] = [];

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
        return this.hitEffects;
    }

    updateHit(height: number): HitEffectParticle[] {
        const next: HitEffectParticle[] = [];
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

    clearHit(): HitEffectParticle[] {
        this.hitEffects = [];
        return this.hitEffects;
    }
}

const worker = new ParticleWorker();

self.onmessage = function (e: MessageEvent<WorkerMessage>) {
    const { type, data } = e.data;

    switch (type) {
        case 'initAmbient':
            worker.initAmbient(
                (data as InitAmbientData).count,
                (data as InitAmbientData).width,
                (data as InitAmbientData).height
            );
            self.postMessage({ type: 'ambientInit', data: worker['ambientParticles'] });
            break;

        case 'updateAmbient':
            const ambient = worker.updateAmbient(
                (data as UpdateAmbientData).width,
                (data as UpdateAmbientData).height
            );
            self.postMessage({ type: 'ambientUpdate', data: ambient });
            break;

        case 'createHit':
            const newHits = worker.createHit(
                (data as CreateHitData).x,
                (data as CreateHitData).y,
                (data as CreateHitData).color,
                (data as CreateHitData).laneWidth
            );
            self.postMessage({ type: 'hitCreate', data: newHits });
            break;

        case 'updateHit':
            const updatedHits = worker.updateHit((data as UpdateHitData).height);
            self.postMessage({ type: 'hitUpdate', data: updatedHits });
            break;

        case 'clearHit':
            const clearedHits = worker.clearHit();
            self.postMessage({ type: 'hitUpdate', data: clearedHits });
            break;
    }
};
