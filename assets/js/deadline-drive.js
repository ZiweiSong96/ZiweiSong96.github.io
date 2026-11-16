(function () {
    'use strict';

    var root = document.getElementById('deadline-drive');
    if (!root) return;

    var roadCanvas = root.querySelector('#dd-road');
    var chartCanvas = root.querySelector('#dd-chart');
    var rackEl = root.querySelector('#dd-rack');
    var statusEl = root.querySelector('#dd-status');
    var playBtn = root.querySelector('#dd-play');
    var resetBtn = root.querySelector('#dd-reset');
    var instrLabel = root.querySelector('#dd-instr-label');
    var memLabel = root.querySelector('#dd-mem-label');
    var p99Inline = root.querySelector('#dd-p99-inline');
    var mP99 = root.querySelector('#dd-m-p99');
    var mMiss = root.querySelector('#dd-m-miss');
    var mHit = root.querySelector('#dd-m-hit');
    var mBatch = root.querySelector('#dd-m-batch');
    var memoryInput = root.querySelector('#dd-memory');
    var deadlineInput = root.querySelector('#dd-deadline');
    var workloadInput = root.querySelector('#dd-workload');
    var memoryOut = root.querySelector('#dd-memory-out');
    var deadlineOut = root.querySelector('#dd-deadline-out');
    var workloadOut = root.querySelector('#dd-workload-out');

    if (!roadCanvas || !chartCanvas || !rackEl) return;

    var roadCtx = roadCanvas.getContext('2d');
    var chartCtx = chartCanvas.getContext('2d');
    var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

    var EXPERTS = 8;
    var WINDOW = 48;
    var TICK_MS = 720;
    var COLORS = ['#3ee6c0', '#6aa9ff', '#a78bfa', '#f2b86b', '#5eead4', '#93c5fd', '#c4b5fd', '#fcd34d'];

    var INSTRUCTIONS = {
        cruise: {
            label: 'Cruise',
            lane: 1,
            bonus: 0,
            slow: false,
            weights: [0.30, 0.24, 0.14, 0.10, 0.08, 0.06, 0.05, 0.03]
        },
        exit: {
            label: 'Take exit',
            lane: 2,
            bonus: 1,
            slow: false,
            weights: [0.16, 0.12, 0.26, 0.20, 0.10, 0.07, 0.05, 0.04]
        },
        avoid: {
            label: 'Avoid cyclist',
            lane: 0,
            bonus: 3,
            slow: false,
            weights: [0.24, 0.22, 0.08, 0.06, 0.16, 0.12, 0.07, 0.05]
        },
        pull: {
            label: 'Pull over',
            lane: 2,
            bonus: -2,
            slow: true,
            weights: [0.32, 0.26, 0.12, 0.08, 0.08, 0.06, 0.05, 0.03]
        }
    };

    var state = {
        running: true,
        visible: true,
        tick: 0,
        memory: 4,
        deadline: 50,
        workload: 6,
        policy: 'rtmoe',
        instruction: 'cruise',
        residents: [],
        lastUsed: new Array(EXPERTS).fill(-1),
        usage: new Array(EXPERTS).fill(0),
        latencies: [],
        tokens: [],
        lastLatency: 0,
        lastMisses: 0,
        lastBatch: 0,
        statusText: '',
        roadOffset: 0,
        speed: 1,
        carY: 0,
        targetLane: 1,
        flash: 0,
        toast: null,
        rng: mulberry32(20261116),
        accum: 0,
        lastFrame: 0
    };

    var slots = [];
    var flashTimers = new Array(EXPERTS).fill(0);
    var roadW = 0;
    var roadH = 0;
    var chartW = 0;
    var chartH = 0;
    var buildingsTop = [];
    var buildingsBottom = [];
    var rafId = null;

    function mulberry32(seed) {
        var a = seed >>> 0;
        return function () {
            a = (a + 0x6D2B79F5) >>> 0;
            var t = a;
            t = Math.imul(t ^ (t >>> 15), t | 1);
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    function clamp(value, min, max) {
        return Math.min(max, Math.max(min, value));
    }

    function roundRect(ctx, x, y, w, h, r) {
        var radius = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
        ctx.beginPath();
        ctx.moveTo(x + radius, y);
        ctx.arcTo(x + w, y, x + w, y + h, radius);
        ctx.arcTo(x + w, y + h, x, y + h, radius);
        ctx.arcTo(x, y + h, x, y, radius);
        ctx.arcTo(x, y, x + w, y, radius);
        ctx.closePath();
    }

    function percentile(values, p) {
        if (!values.length) return null;
        var sorted = values.slice().sort(function (a, b) { return a - b; });
        var index = Math.min(sorted.length - 1, Math.max(0, Math.floor(p * (sorted.length - 1))));
        return sorted[index];
    }

    function laneY(lane) {
        var top = roadH * 0.30;
        var bottom = roadH * 0.78;
        var laneHeight = (bottom - top) / 3;
        return top + laneHeight * (lane + 0.5);
    }

    function carX() {
        return roadW * 0.26;
    }

    function buildRack() {
        for (var i = 0; i < EXPERTS; i += 1) {
            var slot = document.createElement('div');
            slot.className = 'dd-slot';
            slot.style.setProperty('--c', COLORS[i]);
            slot.innerHTML = '<span class="dd-dot"></span>E' + (i + 1);
            slot.setAttribute('aria-label', 'Expert E' + (i + 1) + ': not resident');
            rackEl.appendChild(slot);
            slots.push(slot);
        }
    }

    function flashSlot(index, className) {
        var slot = slots[index];
        if (!slot) return;
        slot.classList.remove('is-loading', 'is-evicted');
        void slot.offsetWidth;
        slot.classList.add(className);
        window.clearTimeout(flashTimers[index]);
        flashTimers[index] = window.setTimeout(function () {
            slot.classList.remove(className);
        }, 720);
    }

    function updateRack() {
        for (var i = 0; i < EXPERTS; i += 1) {
            var resident = state.residents.indexOf(i) !== -1;
            slots[i].classList.toggle('is-resident', resident);
            slots[i].setAttribute('aria-label', 'Expert E' + (i + 1) + (resident ? ': resident in memory' : ': not resident'));
        }
        memLabel.textContent = state.residents.length + ' / ' + EXPERTS + ' in memory';
    }

    function hottestNonResident() {
        var best = null;
        var bestScore = -Infinity;
        for (var i = 0; i < EXPERTS; i += 1) {
            if (state.residents.indexOf(i) !== -1) continue;
            var score = state.usage[i];
            if (score > bestScore) {
                bestScore = score;
                best = i;
            }
        }
        return best;
    }

    function pickVictim(exclude) {
        var victim = null;
        var hot = null;

        if (state.policy === 'rtmoe') {
            var weights = INSTRUCTIONS[state.instruction].weights;
            hot = weights
                .map(function (weight, index) { return { weight: weight, index: index }; })
                .sort(function (a, b) { return b.weight - a.weight; })
                .slice(0, 2)
                .map(function (item) { return item.index; });
        }

        for (var i = 0; i < state.residents.length; i += 1) {
            var expert = state.residents[i];
            if (expert === exclude) continue;
            if (hot && hot.indexOf(expert) !== -1) continue;
            if (victim === null) {
                victim = expert;
                continue;
            }
            if (state.policy === 'lru') {
                if (state.lastUsed[expert] < state.lastUsed[victim]) victim = expert;
            } else if (state.usage[expert] < state.usage[victim] ||
                       (state.usage[expert] === state.usage[victim] && state.lastUsed[expert] < state.lastUsed[victim])) {
                victim = expert;
            }
        }

        if (victim === null) {
            for (var j = 0; j < state.residents.length; j += 1) {
                var fallback = state.residents[j];
                if (fallback === exclude) continue;
                if (victim === null) {
                    victim = fallback;
                    continue;
                }
                if (state.lastUsed[fallback] < state.lastUsed[victim]) victim = fallback;
            }
        }

        return victim;
    }

    function removeResident(expert) {
        var index = state.residents.indexOf(expert);
        if (index !== -1) state.residents.splice(index, 1);
    }

    function fillFreeSlots() {
        while (state.residents.length < state.memory) {
            var expert = hottestNonResident();
            if (expert === null) break;
            state.residents.push(expert);
            state.lastUsed[expert] = state.tick;
            flashSlot(expert, 'is-loading');
        }
    }

    function chooseExpert(weights) {
        var roll = state.rng();
        var acc = 0;
        for (var i = 0; i < weights.length; i += 1) {
            acc += weights[i];
            if (roll < acc) return i;
        }
        return weights.length - 1;
    }

    function getStats() {
        var len = state.latencies.length;
        var latencies = state.latencies.map(function (item) { return item.latency; });
        var p99 = percentile(latencies, 0.99);
        var missTicks = state.latencies.filter(function (item) {
            return item.latency > state.deadline;
        }).length;
        var totalTokens = state.latencies.reduce(function (sum, item) { return sum + item.tokens; }, 0);
        var totalMisses = state.latencies.reduce(function (sum, item) { return sum + item.misses; }, 0);
        return {
            len: len,
            p99: p99,
            missRate: len ? missTicks / len : null,
            hitRate: totalTokens ? 1 - totalMisses / totalTokens : null
        };
    }

    function updateMetrics() {
        var stats = getStats();
        var p99Text = stats.p99 === null ? '—' : Math.round(stats.p99) + ' ms';
        p99Inline.textContent = stats.p99 === null ? 'p99 —' : 'p99 ' + Math.round(stats.p99) + 'ms';
        mP99.textContent = p99Text;
        mMiss.textContent = stats.missRate === null ? '—' : (stats.missRate * 100).toFixed(1) + '%';
        mHit.textContent = stats.hitRate === null ? '—' : Math.round(stats.hitRate * 100) + '%';
        mBatch.textContent = state.lastBatch ? state.lastBatch + ' tok' : '—';
    }

    function updateStatus(force) {
        var stats = getStats();
        var text = 'WARMING UP';
        var className = 'is-warm';

        if (stats.len >= 6) {
            if (state.lastLatency > state.deadline || stats.missRate > 0.15) {
                text = 'MISS';
                className = 'is-miss';
            } else if (stats.p99 > state.deadline || stats.missRate > 0.04) {
                text = 'AT RISK';
                className = 'is-risk';
            } else {
                text = 'ON TIME';
                className = 'is-ok';
            }
        }

        if (force || text !== state.statusText) {
            state.statusText = text;
            statusEl.textContent = text;
            statusEl.className = 'dd-status ' + className;
        }
    }

    function tick() {
        state.tick += 1;
        var instruction = INSTRUCTIONS[state.instruction];
        var batchSize = clamp(state.workload + instruction.bonus, 2, 14);

        for (var i = 0; i < EXPERTS; i += 1) {
            state.usage[i] *= 0.9;
        }

        if (state.policy === 'rtmoe' && state.residents.length < state.memory) {
            fillFreeSlots();
        }

        var batch = [];
        var misses = new Set();

        for (var j = 0; j < batchSize; j += 1) {
            var expert = chooseExpert(instruction.weights);
            state.usage[expert] += 1;
            var resident = state.residents.indexOf(expert) !== -1;
            if (resident) {
                state.lastUsed[expert] = state.tick;
            } else {
                misses.add(expert);
            }
            batch.push({ expert: expert, hit: resident });
        }

        misses.forEach(function (expert) {
            if (state.residents.indexOf(expert) !== -1) return;
            if (state.residents.length >= state.memory) {
                var victim = pickVictim(expert);
                if (victim !== null) {
                    removeResident(victim);
                    flashSlot(victim, 'is-evicted');
                }
            }
            state.residents.push(expert);
            state.lastUsed[expert] = state.tick;
            flashSlot(expert, 'is-loading');
        });

        var compute = 6 + batchSize * 1.35;
        var loadCost = misses.size * 11;
        var jitter = (state.rng() - 0.5) * 3;
        var latency = Math.max(4, compute + loadCost + jitter);

        state.lastLatency = latency;
        state.lastMisses = misses.size;
        state.lastBatch = batchSize;
        state.latencies.push({ latency: latency, misses: misses.size, tokens: batchSize });
        if (state.latencies.length > WINDOW) state.latencies.shift();
        state.flash = latency > state.deadline ? 1 : Math.max(0, state.flash - 0.2);

        var carYNow = state.carY || laneY(INSTRUCTIONS[state.instruction].lane);
        state.tokens = batch.map(function (token, index) {
            return {
                expert: token.expert,
                hit: token.hit,
                age: reduceMotion.matches ? 0.55 : 0,
                sx: carX() + 18 + (state.rng() - 0.5) * 8,
                sy: carYNow + (state.rng() - 0.5) * 10,
                delay: (index / batch.length) * 0.12
            };
        });

        updateRack();
        updateMetrics();
        updateStatus(false);
        drawChart();
    }

    function statsLabel(value, suffix) {
        return value === null ? '—' : Math.round(value) + suffix;
    }

    function drawChart() {
        if (!chartW || !chartH) return;
        var ctx = chartCtx;
        var w = chartW;
        var h = chartH;
        var padTop = 7;
        var padBottom = 10;
        var plotH = h - padTop - padBottom;
        var data = state.latencies;
        var stats = getStats();

        ctx.clearRect(0, 0, w, h);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.018)';
        roundRect(ctx, 0, 0, w, h, 6);
        ctx.fill();

        if (!data.length) {
            ctx.fillStyle = 'rgba(139, 156, 177, 0.65)';
            ctx.font = '9px "JetBrains Mono", ui-monospace, monospace';
            ctx.textAlign = 'center';
            ctx.fillText('waiting for samples', w / 2, h / 2 + 3);
            ctx.textAlign = 'left';
            return;
        }

        var maxLatency = Math.max(state.deadline * 1.4, 20);
        data.forEach(function (item) {
            if (item.latency > maxLatency) maxLatency = item.latency;
        });
        maxLatency *= 1.06;

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
        ctx.lineWidth = 1;
        for (var row = 1; row <= 2; row += 1) {
            var gy = padTop + (plotH / 3) * row;
            ctx.beginPath();
            ctx.moveTo(0, gy);
            ctx.lineTo(w, gy);
            ctx.stroke();
        }

        var slot = Math.max(2, (w - 4) / WINDOW);
        var barW = Math.max(1, slot - 1);
        var offset = WINDOW - data.length;

        data.forEach(function (item, index) {
            var x = 2 + (offset + index) * slot;
            var barH = Math.max(1, (item.latency / maxLatency) * plotH);
            var y = padTop + plotH - barH;
            ctx.fillStyle = item.latency > state.deadline ? 'rgba(255, 122, 122, 0.82)' : 'rgba(62, 230, 192, 0.72)';
            roundRect(ctx, x, y, barW, barH, 1);
            ctx.fill();
        });

        var deadlineY = padTop + plotH - (state.deadline / maxLatency) * plotH;
        ctx.save();
        ctx.setLineDash([4, 3]);
        ctx.strokeStyle = 'rgba(242, 184, 107, 0.7)';
        ctx.beginPath();
        ctx.moveTo(0, deadlineY);
        ctx.lineTo(w, deadlineY);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = 'rgba(242, 184, 107, 0.82)';
        ctx.font = '8px "JetBrains Mono", ui-monospace, monospace';
        ctx.fillText('DL ' + state.deadline, 2, Math.max(8, deadlineY - 3));
        ctx.restore();

        if (stats.p99 !== null) {
            var p99Y = padTop + plotH - (stats.p99 / maxLatency) * plotH;
            ctx.save();
            ctx.setLineDash([1, 3]);
            ctx.strokeStyle = 'rgba(106, 169, 255, 0.5)';
            ctx.beginPath();
            ctx.moveTo(0, p99Y);
            ctx.lineTo(w, p99Y);
            ctx.stroke();
            ctx.restore();
        }
    }

    function buildScenery() {
        var rng = mulberry32(1337);
        var top = roadH * 0.30;
        var bottom = roadH * 0.78;
        buildingsTop = [];
        buildingsBottom = [];

        function makeStrip(anchor, available, direction) {
            var result = [];
            var x = -24;
            while (x < roadW + 24) {
                var bw = 18 + rng() * 46;
                var bh = Math.min(Math.max(6, available - 6), 10 + rng() * Math.max(8, available * 0.8));
                var windows = [];
                var cols = Math.max(1, Math.floor((bw - 6) / 7));
                var rows = Math.max(1, Math.floor((bh - 6) / 7));
                for (var c = 0; c < cols; c += 1) {
                    for (var r = 0; r < rows; r += 1) {
                        if (rng() < 0.16) {
                            windows.push({
                                x: 3 + c * 7,
                                y: 3 + r * 7,
                                teal: rng() < 0.72
                            });
                        }
                    }
                }
                result.push({
                    x: x,
                    bw: bw,
                    bh: bh,
                    windows: windows,
                    accent: rng() < 0.12,
                    direction: direction
                });
                x += bw + 5 + rng() * 8;
            }
            return result;
        }

        if (roadW > 0 && top > 20) {
            buildingsTop = makeStrip(top, top, 'up');
        }
        if (roadW > 0 && roadH - bottom > 20) {
            buildingsBottom = makeStrip(bottom, roadH - bottom, 'down');
        }
    }

    function drawBuildings(ctx) {
        var top = roadH * 0.30;
        var bottom = roadH * 0.78;

        function drawStrip(items, anchor) {
            items.forEach(function (building) {
                var y = building.direction === 'up' ? anchor - building.bh : anchor;
                ctx.fillStyle = '#0a1119';
                ctx.fillRect(building.x, y, building.bw, building.bh);
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.035)';
                ctx.lineWidth = 1;
                ctx.strokeRect(building.x + 0.5, y + 0.5, building.bw - 1, building.bh - 1);

                building.windows.forEach(function (windowItem) {
                    ctx.fillStyle = windowItem.teal ? 'rgba(62, 230, 192, 0.30)' : 'rgba(242, 184, 107, 0.26)';
                    ctx.fillRect(building.x + windowItem.x, y + windowItem.y, 2, 2);
                });

                if (building.accent) {
                    ctx.fillStyle = 'rgba(62, 230, 192, 0.55)';
                    ctx.fillRect(building.x + 4, y + 2, Math.min(building.bw - 8, 18), 1);
                }
            });
        }

        drawStrip(buildingsTop, top);
        drawStrip(buildingsBottom, bottom);
    }

    function drawStreetlights(ctx, top, bottom) {
        for (var x = 36; x < roadW; x += 92) {
            ctx.strokeStyle = 'rgba(39, 59, 80, 0.9)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(x, top);
            ctx.lineTo(x, top - 9);
            ctx.moveTo(x, bottom);
            ctx.lineTo(x, bottom + 9);
            ctx.stroke();

            [top - 9, bottom + 9].forEach(function (y) {
                var glow = ctx.createRadialGradient(x, y, 0, x, y, 18);
                glow.addColorStop(0, 'rgba(62, 230, 192, 0.14)');
                glow.addColorStop(1, 'rgba(62, 230, 192, 0)');
                ctx.fillStyle = glow;
                ctx.beginPath();
                ctx.arc(x, y, 18, 0, Math.PI * 2);
                ctx.fill();
            });

            ctx.fillStyle = 'rgba(62, 230, 192, 0.8)';
            ctx.fillRect(x - 1.5, top - 10, 3, 2);
            ctx.fillRect(x - 1.5, bottom + 8, 3, 2);
        }
    }

    function drawRoad(ctx) {
        var top = roadH * 0.30;
        var bottom = roadH * 0.78;
        var laneH = (bottom - top) / 3;

        var roadGradient = ctx.createLinearGradient(0, top, 0, bottom);
        roadGradient.addColorStop(0, '#0a1119');
        roadGradient.addColorStop(0.5, '#0b141d');
        roadGradient.addColorStop(1, '#091017');
        ctx.fillStyle = roadGradient;
        ctx.fillRect(0, top, roadW, bottom - top);

        ctx.strokeStyle = 'rgba(62, 230, 192, 0.32)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, top + 0.5);
        ctx.lineTo(roadW, top + 0.5);
        ctx.moveTo(0, bottom - 0.5);
        ctx.lineTo(roadW, bottom - 0.5);
        ctx.stroke();

        ctx.save();
        ctx.strokeStyle = 'rgba(215, 225, 236, 0.22)';
        ctx.lineWidth = 1;
        ctx.setLineDash([14, 12]);
        ctx.lineDashOffset = -state.roadOffset;
        for (var i = 1; i < 3; i += 1) {
            var y = top + laneH * i;
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(roadW, y);
            ctx.stroke();
        }
        ctx.restore();

        ctx.fillStyle = 'rgba(62, 230, 192, 0.035)';
        ctx.fillRect(0, top + laneH * 1.35, roadW, laneH * 0.3);
    }

    function drawRoute(ctx) {
        var instruction = INSTRUCTIONS[state.instruction];
        var lane = laneY(state.targetLane);
        var instructionY = laneY(instruction.lane);

        ctx.save();
        ctx.strokeStyle = 'rgba(62, 230, 192, 0.2)';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 7]);
        ctx.lineDashOffset = -state.roadOffset * 0.7;
        ctx.beginPath();
        ctx.moveTo(carX() + 26, instructionY);
        ctx.lineTo(roadW - 12, instructionY);
        ctx.stroke();
        ctx.restore();

        if (state.instruction === 'exit') {
            ctx.save();
            ctx.strokeStyle = 'rgba(62, 230, 192, 0.3)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(roadW * 0.58, laneY(2));
            ctx.quadraticCurveTo(roadW * 0.78, laneY(2), roadW * 0.93, roadH * 0.80);
            ctx.stroke();
            ctx.restore();

            ctx.fillStyle = 'rgba(7, 11, 16, 0.88)';
            ctx.strokeStyle = 'rgba(62, 230, 192, 0.5)';
            roundRect(ctx, roadW * 0.64, roadH * 0.31, 34, 14, 3);
            ctx.fill();
            ctx.stroke();
            ctx.fillStyle = 'rgba(62, 230, 192, 0.9)';
            ctx.font = '7px "JetBrains Mono", ui-monospace, monospace';
            ctx.fillText('EXIT', roadW * 0.64 + 6, roadH * 0.31 + 9);
        }

        if (state.instruction === 'avoid') {
            var cx = roadW * 0.64;
            var cy = laneY(1);
            ctx.strokeStyle = 'rgba(242, 184, 107, 0.6)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.arc(cx, cy, 7, 0, Math.PI * 2);
            ctx.moveTo(cx - 4, cy);
            ctx.lineTo(cx + 4, cy);
            ctx.moveTo(cx, cy - 4);
            ctx.lineTo(cx, cy + 4);
            ctx.stroke();
            ctx.fillStyle = 'rgba(242, 184, 107, 0.9)';
            ctx.beginPath();
            ctx.moveTo(cx - 5, cy - 16);
            ctx.lineTo(cx + 5, cy - 16);
            ctx.lineTo(cx, cy - 23);
            ctx.closePath();
            ctx.fill();
            ctx.fillStyle = 'rgba(7, 11, 16, 0.9)';
            ctx.font = '7px "JetBrains Mono", ui-monospace, monospace';
            ctx.fillText('!', cx - 1, cy - 17);
        }

        if (state.instruction === 'pull') {
            ctx.fillStyle = 'rgba(7, 11, 16, 0.88)';
            ctx.strokeStyle = 'rgba(62, 230, 192, 0.45)';
            roundRect(ctx, roadW * 0.76, roadH * 0.81, 22, 14, 3);
            ctx.fill();
            ctx.stroke();
            ctx.fillStyle = 'rgba(62, 230, 192, 0.9)';
            ctx.font = '8px "JetBrains Mono", ui-monospace, monospace';
            ctx.fillText('P', roadW * 0.76 + 8, roadH * 0.81 + 10);
        }

        if (lane !== instructionY) {
            ctx.strokeStyle = 'rgba(62, 230, 192, 0.25)';
            ctx.setLineDash([3, 4]);
            ctx.beginPath();
            ctx.moveTo(carX(), lane);
            ctx.lineTo(carX() + 24, instructionY);
            ctx.stroke();
            ctx.setLineDash([]);
        }
    }

    function drawCar(ctx) {
        var scale = clamp(roadW / 700, 0.78, 1.05);
        var braking = state.lastLatency > state.deadline;
        var cx = carX();
        var cy = state.carY || laneY(1);

        ctx.save();
        ctx.translate(cx, cy);
        ctx.scale(scale, scale);

        ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
        ctx.beginPath();
        ctx.ellipse(0, 5, 32, 13, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.globalCompositeOperation = 'lighter';
        var beam = ctx.createLinearGradient(26, 0, 96, 0);
        beam.addColorStop(0, 'rgba(62, 230, 192, 0.20)');
        beam.addColorStop(1, 'rgba(62, 230, 192, 0)');
        ctx.fillStyle = beam;
        ctx.beginPath();
        ctx.moveTo(26, -8);
        ctx.lineTo(98, -22);
        ctx.lineTo(98, 22);
        ctx.lineTo(26, 8);
        ctx.closePath();
        ctx.fill();
        ctx.globalCompositeOperation = 'source-over';

        ctx.fillStyle = '#05080c';
        roundRect(ctx, -22, -15, 12, 4, 2);
        ctx.fill();
        roundRect(ctx, -22, 11, 12, 4, 2);
        ctx.fill();
        roundRect(ctx, 10, -15, 12, 4, 2);
        ctx.fill();
        roundRect(ctx, 10, 11, 12, 4, 2);
        ctx.fill();

        var body = ctx.createLinearGradient(0, -14, 0, 14);
        body.addColorStop(0, '#20505a');
        body.addColorStop(0.5, '#12333c');
        body.addColorStop(1, '#0b2028');
        ctx.fillStyle = body;
        ctx.strokeStyle = 'rgba(62, 230, 192, 0.42)';
        ctx.lineWidth = 1;
        roundRect(ctx, -28, -14, 56, 28, 7);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#09141a';
        roundRect(ctx, -11, -9, 22, 18, 4);
        ctx.fill();

        ctx.fillStyle = 'rgba(62, 230, 192, 0.28)';
        roundRect(ctx, 7, -8, 7, 16, 2);
        ctx.fill();
        roundRect(ctx, -17, -8, 5, 16, 2);
        ctx.fill();

        ctx.fillStyle = braking ? 'rgba(255, 90, 90, 1)' : 'rgba(255, 122, 122, 0.78)';
        ctx.shadowColor = 'rgba(255, 90, 90, 0.8)';
        ctx.shadowBlur = braking ? 12 : 5;
        ctx.fillRect(-29, -9, 3, 5);
        ctx.fillRect(-29, 4, 3, 5);
        ctx.shadowBlur = 0;

        ctx.fillStyle = '#d8fff7';
        ctx.shadowColor = 'rgba(216, 255, 247, 0.8)';
        ctx.shadowBlur = braking ? 3 : 8;
        ctx.fillRect(27, -9, 2, 5);
        ctx.fillRect(27, 4, 2, 5);
        ctx.shadowBlur = 0;

        ctx.restore();
    }

    function drawUplink(ctx) {
        var tx = roadW * 0.93;
        var ty = roadH * 0.10;
        var cx = carX();
        var cy = state.carY || laneY(1);

        ctx.save();
        ctx.strokeStyle = 'rgba(62, 230, 192, 0.22)';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 8]);
        ctx.lineDashOffset = -state.roadOffset * 0.4;
        ctx.beginPath();
        ctx.moveTo(cx + 18, cy);
        ctx.lineTo(tx, ty);
        ctx.stroke();
        ctx.restore();

        ctx.fillStyle = 'rgba(7, 11, 16, 0.85)';
        ctx.strokeStyle = 'rgba(62, 230, 192, 0.45)';
        roundRect(ctx, tx - 10, ty - 10, 20, 20, 4);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = 'rgba(62, 230, 192, 0.8)';
        ctx.font = '6px "JetBrains Mono", ui-monospace, monospace';
        ctx.fillText('MoE', tx - 8, ty + 3);
    }

    function drawTokens(ctx) {
        var tx = roadW * 0.93;
        var ty = roadH * 0.10;

        state.tokens.forEach(function (token) {
            var t = clamp((token.age - token.delay) / Math.max(0.001, 1 - token.delay), 0, 1);
            if (t <= 0) return;
            var cpX = token.sx + (tx - token.sx) * 0.38;
            var cpY = token.sy - Math.max(18, (token.sy - ty) * 0.55);
            var oneMinus = 1 - t;
            var x = oneMinus * oneMinus * token.sx + 2 * oneMinus * t * cpX + t * t * tx;
            var y = oneMinus * oneMinus * token.sy + 2 * oneMinus * t * cpY + t * t * ty;
            var color = COLORS[token.expert];
            var radius = 2.2 + (1 - t) * 0.8;

            ctx.save();
            ctx.globalAlpha = 1 - t * 0.55;
            ctx.fillStyle = color;
            ctx.shadowColor = color;
            ctx.shadowBlur = 8;
            ctx.beginPath();
            ctx.arc(x, y, radius, 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 0;

            if (!token.hit) {
                ctx.strokeStyle = 'rgba(255, 122, 122, 0.75)';
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.arc(x, y, radius + 2.4, 0, Math.PI * 2);
                ctx.stroke();
            }
            ctx.restore();
        });
    }

    function drawToast(ctx, now) {
        if (!state.toast || now >= state.toast.until) return;
        var remaining = state.toast.until - now;
        var alpha = clamp(remaining / 260, 0, 1);
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = 'rgba(7, 11, 16, 0.88)';
        ctx.strokeStyle = 'rgba(62, 230, 192, 0.45)';
        roundRect(ctx, 10, 10, 166, 20, 5);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = 'rgba(62, 230, 192, 0.95)';
        ctx.font = '8px "JetBrains Mono", ui-monospace, monospace';
        ctx.fillText('INSTRUCTION · ' + state.toast.text, 18, 23);
        ctx.restore();
    }

    function drawScene(now) {
        if (!roadW || !roadH) return;
        var ctx = roadCtx;
        var w = roadW;
        var h = roadH;
        var top = h * 0.30;
        var bottom = h * 0.78;

        ctx.clearRect(0, 0, w, h);
        var background = ctx.createLinearGradient(0, 0, 0, h);
        background.addColorStop(0, '#05080d');
        background.addColorStop(0.45, '#070c12');
        background.addColorStop(1, '#04070b');
        ctx.fillStyle = background;
        ctx.fillRect(0, 0, w, h);

        drawBuildings(ctx);
        drawRoad(ctx);
        drawStreetlights(ctx, top, bottom);
        drawRoute(ctx);
        drawUplink(ctx);
        drawCar(ctx);
        drawTokens(ctx);
        drawToast(ctx, now);

        if (state.flash > 0.02) {
            var vignette = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.18, w / 2, h / 2, Math.max(w, h) * 0.62);
            vignette.addColorStop(0, 'rgba(255, 70, 70, 0)');
            vignette.addColorStop(1, 'rgba(255, 70, 70, ' + (0.22 * state.flash).toFixed(3) + ')');
            ctx.fillStyle = vignette;
            ctx.fillRect(0, 0, w, h);

            if (state.flash > 0.45) {
                ctx.fillStyle = 'rgba(255, 122, 122, 0.9)';
                ctx.font = '9px "JetBrains Mono", ui-monospace, monospace';
                ctx.textAlign = 'center';
                ctx.fillText('CONTROL DEADLINE MISS', w / 2, top - 8);
                ctx.textAlign = 'left';
            }
        }
    }

    function resize() {
        var dpr = Math.min(window.devicePixelRatio || 1, 2);
        var newRoadW = Math.max(1, Math.round(roadCanvas.clientWidth || 0));
        var newRoadH = Math.max(1, Math.round(roadCanvas.clientHeight || 0));
        var newChartW = Math.max(1, Math.round(chartCanvas.clientWidth || 0));
        var newChartH = Math.max(1, Math.round(chartCanvas.clientHeight || 0));

        if (newRoadW === roadW && newRoadH === roadH && newChartW === chartW && newChartH === chartH) {
            return;
        }

        roadW = newRoadW;
        roadH = newRoadH;
        chartW = newChartW;
        chartH = newChartH;

        roadCanvas.width = Math.round(roadW * dpr);
        roadCanvas.height = Math.round(roadH * dpr);
        roadCtx.setTransform(dpr, 0, 0, dpr, 0, 0);

        chartCanvas.width = Math.round(chartW * dpr);
        chartCanvas.height = Math.round(chartH * dpr);
        chartCtx.setTransform(dpr, 0, 0, dpr, 0, 0);

        buildScenery();
        state.carY = laneY(state.targetLane);
        drawChart();
        drawScene(performance.now());
    }

    function setInstruction(key, quiet) {
        if (!INSTRUCTIONS[key]) return;
        state.instruction = key;
        state.targetLane = INSTRUCTIONS[key].lane;
        instrLabel.textContent = INSTRUCTIONS[key].label;
        root.querySelectorAll('[data-instruction]').forEach(function (button) {
            var active = button.getAttribute('data-instruction') === key;
            button.classList.toggle('is-active', active);
            button.setAttribute('aria-pressed', active ? 'true' : 'false');
        });
        if (!quiet) {
            state.toast = { text: INSTRUCTIONS[key].label, until: performance.now() + 1600 };
        }
    }

    function setPolicy(key, quiet) {
        state.policy = key === 'lru' ? 'lru' : 'rtmoe';
        root.querySelectorAll('[data-policy]').forEach(function (button) {
            var active = button.getAttribute('data-policy') === state.policy;
            button.classList.toggle('is-active', active);
            button.setAttribute('aria-pressed', active ? 'true' : 'false');
        });
        if (!quiet && state.policy === 'rtmoe') {
            fillFreeSlots();
            updateRack();
        }
    }

    function setMemory(amount) {
        state.memory = clamp(amount, 2, EXPERTS);
        memoryOut.textContent = state.memory + ' experts';
        while (state.residents.length > state.memory) {
            var victim = pickVictim();
            if (victim === null) break;
            removeResident(victim);
            flashSlot(victim, 'is-evicted');
        }
        fillFreeSlots();
        updateRack();
        updateMetrics();
        updateStatus();
        drawChart();
    }

    function setRunning(running) {
        state.running = running;
        playBtn.innerHTML = running
            ? '<i class="fas fa-pause" aria-hidden="true"></i> Pause'
            : '<i class="fas fa-play" aria-hidden="true"></i> Play';
        playBtn.setAttribute('aria-label', running ? 'Pause simulation' : 'Resume simulation');
        state.accum = 0;
        state.lastFrame = performance.now();
    }

    function resetState() {
        state.tick = 0;
        state.memory = 4;
        state.deadline = 50;
        state.workload = 6;
        state.policy = 'rtmoe';
        state.instruction = 'cruise';
        state.residents = [];
        state.lastUsed = new Array(EXPERTS).fill(-1);
        state.usage = new Array(EXPERTS).fill(0);
        state.latencies = [];
        state.tokens = [];
        state.lastLatency = 0;
        state.lastMisses = 0;
        state.lastBatch = 0;
        state.statusText = '';
        state.roadOffset = 0;
        state.speed = 1;
        state.targetLane = INSTRUCTIONS.cruise.lane;
        state.carY = laneY(state.targetLane);
        state.flash = 0;
        state.toast = null;
        state.rng = mulberry32(20261116);
        state.accum = 0;
        state.lastFrame = performance.now();

        for (var i = 0; i < state.memory; i += 1) {
            state.residents.push(i);
        }

        slots.forEach(function (slot) {
            slot.classList.remove('is-resident', 'is-loading', 'is-evicted');
        });
        flashTimers.forEach(function (timer) { window.clearTimeout(timer); });
        flashTimers = new Array(EXPERTS).fill(0);

        memoryInput.value = state.memory;
        deadlineInput.value = state.deadline;
        workloadInput.value = state.workload;
        memoryOut.textContent = state.memory + ' experts';
        deadlineOut.textContent = state.deadline + ' ms';
        workloadOut.textContent = state.workload + ' tokens';

        setInstruction('cruise', true);
        setPolicy('rtmoe', true);
        setRunning(true);
        updateRack();
        for (var n = 0; n < 6; n += 1) {
            tick();
        }
        updateMetrics();
        updateStatus(true);
        drawChart();
        drawScene(performance.now());
    }

    function bindEvents() {
        root.querySelectorAll('[data-instruction]').forEach(function (button) {
            button.addEventListener('click', function () {
                setInstruction(button.getAttribute('data-instruction'), false);
            });
        });

        root.querySelectorAll('[data-policy]').forEach(function (button) {
            button.addEventListener('click', function () {
                setPolicy(button.getAttribute('data-policy'), false);
            });
        });

        memoryInput.addEventListener('input', function () {
            setMemory(parseInt(memoryInput.value, 10));
        });

        deadlineInput.addEventListener('input', function () {
            state.deadline = parseInt(deadlineInput.value, 10);
            deadlineOut.textContent = state.deadline + ' ms';
            updateMetrics();
            updateStatus();
            drawChart();
        });

        workloadInput.addEventListener('input', function () {
            state.workload = parseInt(workloadInput.value, 10);
            workloadOut.textContent = state.workload + ' tokens';
        });

        playBtn.addEventListener('click', function () {
            setRunning(!state.running);
        });

        resetBtn.addEventListener('click', resetState);

        if ('IntersectionObserver' in window) {
            var observer = new IntersectionObserver(function (entries) {
                state.visible = entries[0].isIntersecting;
                if (state.visible) {
                    state.lastFrame = performance.now();
                    drawChart();
                    drawScene(performance.now());
                }
            }, { threshold: 0.01 });
            observer.observe(root);
        }

        document.addEventListener('visibilitychange', function () {
            state.lastFrame = performance.now();
        });
    }

    function frame(now) {
        var dt = Math.min(60, now - (state.lastFrame || now));
        state.lastFrame = now;

        if (!state.visible) {
            rafId = window.requestAnimationFrame(frame);
            return;
        }

        if (state.running) {
            state.accum += dt;
            if (state.accum >= TICK_MS) {
                state.accum = state.accum % TICK_MS;
                tick();
            }

            if (!reduceMotion.matches) {
                state.roadOffset += dt * 0.05 * state.speed;
                state.carY += (laneY(state.targetLane) - state.carY) * 0.08;
                state.tokens.forEach(function (token) {
                    token.age = Math.min(1, token.age + dt / TICK_MS);
                });
                state.tokens = state.tokens.filter(function (token) { return token.age < 1; });
                state.flash *= 0.94;
                var targetSpeed = INSTRUCTIONS[state.instruction].slow
                    ? 0.45
                    : (state.lastLatency > state.deadline ? 0.35 : 1);
                state.speed += (targetSpeed - state.speed) * 0.06;
            } else {
                state.carY = laneY(state.targetLane);
            }
        }

        drawScene(now);
        rafId = window.requestAnimationFrame(frame);
    }

    buildRack();
    bindEvents();
    resize();
    resetState();
    rafId = window.requestAnimationFrame(frame);

    window.addEventListener('resize', resize);
    if ('ResizeObserver' in window) {
        var resizeObserver = new ResizeObserver(resize);
        resizeObserver.observe(roadCanvas);
        resizeObserver.observe(chartCanvas);
    }

    reduceMotion.addEventListener('change', function () {
        state.carY = laneY(state.targetLane);
        drawScene(performance.now());
    });
})();
