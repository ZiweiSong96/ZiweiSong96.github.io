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
    var selectedLabel = root.querySelector('#dd-selected');
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
    var paperPop = root.querySelector('#dd-paper-pop');
    var paperTopic = paperPop ? paperPop.querySelector('.dd-paper-topic') : null;
    var paperTitle = paperPop ? paperPop.querySelector('.dd-paper-title') : null;
    var paperMeta = paperPop ? paperPop.querySelector('.dd-paper-meta') : null;
    var paperDesc = paperPop ? paperPop.querySelector('.dd-paper-desc') : null;
    var paperLink = paperPop ? paperPop.querySelector('.dd-paper-link') : null;
    var paperClose = root.querySelector('#dd-paper-close');

    if (!roadCanvas || !chartCanvas || !rackEl) return;

    var roadCtx = roadCanvas.getContext('2d');
    var chartCtx = chartCanvas.getContext('2d');
    var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

    var EXPERTS = 8;
    var WINDOW = 48;
    var TICK_MS = 720;
    var COLORS = ['#a9742b', '#a95f35', '#3f6f68', '#8f2f2f', '#b08d57', '#6b7f5a', '#c79a4a', '#7a5a3a'];

    var INSTRUCTIONS = {
        cruise: {
            label: 'Full steam',
            lane: 1,
            bonus: 0,
            slow: false,
            weights: [0.30, 0.24, 0.14, 0.10, 0.08, 0.06, 0.05, 0.03]
        },
        exit: {
            label: 'Switch track',
            lane: 2,
            bonus: 1,
            slow: false,
            weights: [0.16, 0.12, 0.26, 0.20, 0.10, 0.07, 0.05, 0.04]
        },
        avoid: {
            label: 'Brake for signal',
            lane: 0,
            bonus: 3,
            slow: true,
            weights: [0.24, 0.22, 0.08, 0.06, 0.16, 0.12, 0.07, 0.05]
        },
        pull: {
            label: 'Stop at station',
            lane: 2,
            bonus: -2,
            slow: true,
            weights: [0.32, 0.26, 0.12, 0.08, 0.08, 0.06, 0.05, 0.03]
        }
    };

    var PAPERS = {
        autoware: {
            topic: 'Human-instructed autonomy',
            title: 'Autoware.Flex: Human-Instructed Dynamically Reconfigurable Autonomous Driving Systems',
            meta: 'RTCSA 2025 · Conference',
            desc: 'Reconfigures the driving stack from a human instruction while keeping the control loop safe.',
            href: 'https://doi.org/10.1109/RTCSA66114.2025.00011'
        },
        rtmoe: {
            topic: 'Real-time MoE inference',
            title: 'RT-MoE: Real-Time Expert Management for Memory-Constrained MoE Decoding',
            meta: 'RTSS 2026 · Accepted',
            desc: 'Keeps the right experts resident under a tight memory budget so decoding stays within its deadline.',
            href: '/publications/#year-2026'
        },
        ater: {
            topic: 'Autoware truck · ROS 2',
            title: 'ATER: Adaptive Task Execution Rate Regulation for Enhanced Real-Time Performance in ROS 2',
            meta: 'RTCSA 2025 · Conference',
            desc: 'A ROS 2 topic from the CityU Shenzhen × Hon Hai autonomous truck project; regulates task execution rates so robot task chains stay responsive.',
            href: '/publications/#year-2025'
        },
        latency: {
            topic: 'Probabilistic latency',
            title: 'Latency analysis for real-time MoE inference',
            meta: 'RTAS · Under review',
            desc: 'Models the tail of the inference-latency distribution and the risk of missing a control deadline.',
            href: null
        },
        tii: {
            topic: 'DNN security',
            title: 'Layer-Wise Security Protection for Deep Neural Networks in Industrial Cyber Physical Systems',
            meta: 'IEEE TII 2022 · Journal',
            desc: 'Layer-wise security protection for DNNs deployed in industrial cyber-physical systems.',
            href: '/publications/#year-2022'
        },
        jsa: {
            topic: 'Accelerator co-scheduling',
            title: 'Optimized Co-scheduling of Mixed-precision Neural Network Accelerator for Real-time Multitasking Applications',
            meta: 'JSA 2020 · Journal',
            desc: 'Co-schedules mixed-precision neural network accelerators for real-time multitasking workloads.',
            href: '/publications/#year-2020'
        },
        codes: {
            topic: 'DNN IP protection',
            title: 'Critical-Weight Based Locking Scheme for DNN IP Protection in Edge Computing',
            meta: 'CODES+ISSS 2021 · WIP',
            desc: 'Critical-weight-based locking to protect DNN intellectual property on edge devices.',
            href: '/publications/#year-2021'
        }
    };

    var PAPER_TARGETS = {
        autoware: '.dd-stage-wrap',
        rtmoe: '#dd-rack',
        latency: '#dd-chart'
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
        selected: [],
        lastUsed: new Array(EXPERTS).fill(-1),
        usage: new Array(EXPERTS).fill(0),
        latencies: [],
        tokens: [],
        actions: [],
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
        spotlight: null,
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
    var skyline = [];
    var rafId = null;
    var activePaper = null;
    var pinnedPaper = null;
    var activeAnchor = null;
    var paperHideTimer = 0;

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

    function drawGear(ctx, x, y, radius, teeth, color, lineWidth, angle) {
        var steps = teeth * 2;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(angle || 0);
        ctx.beginPath();
        for (var i = 0; i < steps; i += 1) {
            var r = i % 2 === 0 ? radius : radius * 0.76;
            var a = -Math.PI / 2 + (Math.PI * 2 / steps) * i;
            var px = Math.cos(a) * r;
            var py = Math.sin(a) * r;
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fillStyle = 'rgba(42, 31, 21, 0.9)';
        ctx.strokeStyle = color;
        ctx.lineWidth = lineWidth || 1;
        ctx.fill();
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(0, 0, radius * 0.3, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.globalAlpha = 0.85;
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.restore();
    }

    function drawValve(ctx, x, y, radius, color, resident, selected, pulse) {
        if (selected) {
            ctx.fillStyle = 'rgba(199, 154, 74, ' + (0.08 + pulse * 0.12).toFixed(3) + ')';
            ctx.beginPath();
            ctx.arc(x, y, radius + 4 + pulse * 2, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.strokeStyle = resident ? color : 'rgba(255, 236, 196, 0.22)';
        ctx.lineWidth = selected ? 1.2 : 0.8;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.stroke();

        ctx.strokeStyle = resident ? color : 'rgba(255, 236, 196, 0.15)';
        ctx.lineWidth = 0.7;
        for (var k = 0; k < 4; k += 1) {
            var angle = Math.PI / 4 + k * (Math.PI / 2);
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x + Math.cos(angle) * radius * 0.72, y + Math.sin(angle) * radius * 0.72);
            ctx.stroke();
        }

        ctx.fillStyle = resident ? color : 'rgba(255, 236, 196, 0.28)';
        ctx.beginPath();
        ctx.arc(x, y, radius * 0.28, 0, Math.PI * 2);
        ctx.fill();

        if (selected) {
            ctx.strokeStyle = 'rgba(255, 246, 224, 0.92)';
            ctx.lineWidth = 1.1;
            ctx.beginPath();
            ctx.arc(x, y, radius + 1.5, 0, Math.PI * 2);
            ctx.stroke();
        }
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
            var selected = state.selected.indexOf(i) !== -1;
            slots[i].classList.toggle('is-resident', resident);
            slots[i].classList.toggle('is-selected', selected);
            var label = 'Expert E' + (i + 1) + (resident ? ': resident in memory' : ': not resident');
            if (selected) label += ', selected this tick';
            slots[i].setAttribute('aria-label', label);
        }
        memLabel.textContent = state.residents.length + ' / ' + EXPERTS + ' in memory';
        if (selectedLabel) {
            selectedLabel.textContent = state.selected.length
                ? state.selected.map(function (expert) { return 'E' + (expert + 1); }).join(' + ')
                : '—';
        }
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

        var counts = new Array(EXPERTS).fill(0);
        batch.forEach(function (token) { counts[token.expert] += 1; });
        state.selected = counts
            .map(function (count, index) { return { count: count, index: index }; })
            .filter(function (item) { return item.count > 0; })
            .sort(function (a, b) { return b.count - a.count; })
            .slice(0, 2)
            .map(function (item) { return item.index; })
            .sort(function (a, b) { return a - b; });

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

        if (!reduceMotion.matches) {
            state.actions.push({
                start: performance.now(),
                duration: clamp(300 + latency * 5.5, 420, 1200),
                miss: latency > state.deadline
            });
            if (state.actions.length > 6) state.actions.shift();
        }

        var train = trainGeometry();
        state.tokens = batch.map(function (token, index) {
            return {
                expert: token.expert,
                hit: token.hit,
                age: reduceMotion.matches ? 0.55 : 0,
                sx: train.anchorX + (state.rng() - 0.5) * 3,
                sy: train.anchorY + (state.rng() - 0.5) * 3,
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
        ctx.fillStyle = 'rgba(169, 116, 43, 0.05)';
        roundRect(ctx, 0, 0, w, h, 6);
        ctx.fill();

        if (!data.length) {
            ctx.fillStyle = 'rgba(139, 156, 177, 0.65)';
            ctx.font = '10px "IBM Plex Mono", ui-monospace, monospace';
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

        ctx.strokeStyle = 'rgba(169, 116, 43, 0.12)';
        ctx.lineWidth = 1;
        for (var row = 1; row <= 2; row += 1) {
            var gy = padTop + (plotH / 3) * row;
            ctx.beginPath();
            ctx.moveTo(0, gy);
            ctx.lineTo(w, gy);
            ctx.stroke();
        }

        ctx.strokeStyle = 'rgba(169, 116, 43, 0.07)';
        for (var column = 1; column < 8; column += 1) {
            var gx = (w / 8) * column;
            ctx.beginPath();
            ctx.moveTo(gx, padTop);
            ctx.lineTo(gx, padTop + plotH);
            ctx.stroke();
        }

        var slot = Math.max(2, (w - 4) / WINDOW);
        var barW = Math.max(1, slot - 1);
        var offset = WINDOW - data.length;

        data.forEach(function (item, index) {
            var x = 2 + (offset + index) * slot;
            var barH = Math.max(1, (item.latency / maxLatency) * plotH);
            var y = padTop + plotH - barH;
            ctx.fillStyle = item.latency > state.deadline ? 'rgba(143, 47, 47, 0.85)' : 'rgba(169, 116, 43, 0.8)';
            roundRect(ctx, x, y, barW, barH, 1);
            ctx.fill();
        });

        var deadlineY = padTop + plotH - (state.deadline / maxLatency) * plotH;
        ctx.save();
        ctx.setLineDash([4, 3]);
        ctx.strokeStyle = 'rgba(143, 47, 47, 0.72)';
        ctx.beginPath();
        ctx.moveTo(0, deadlineY);
        ctx.lineTo(w, deadlineY);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = 'rgba(143, 47, 47, 0.85)';
        ctx.font = '10px "IBM Plex Mono", ui-monospace, monospace';
        ctx.fillText('DL ' + state.deadline, 2, Math.max(10, deadlineY - 4));
        ctx.restore();

        if (stats.p99 !== null) {
            var p99Y = padTop + plotH - (stats.p99 / maxLatency) * plotH;
            ctx.save();
            ctx.setLineDash([1, 3]);
            ctx.strokeStyle = 'rgba(63, 111, 104, 0.5)';
            ctx.beginPath();
            ctx.moveTo(0, p99Y);
            ctx.lineTo(w, p99Y);
            ctx.stroke();
            ctx.restore();
        }
    }

    function buildScenery() {
        var rng = mulberry32(20261117);
        skyline = [];
        var x = -24;
        while (x < roadW + 24) {
            var bw = 22 + rng() * 48;
            var bh = 18 + rng() * 54;
            var windows = [];
            var cols = Math.max(1, Math.floor((bw - 6) / 9));
            var rows = Math.max(1, Math.floor((bh - 8) / 10));
            for (var c = 0; c < cols; c += 1) {
                for (var r = 0; r < rows; r += 1) {
                    if (rng() < 0.28) {
                        windows.push({ x: 4 + c * 9, y: 5 + r * 10, warm: rng() < 0.65 });
                    }
                }
            }
            skyline.push({
                x: x,
                bw: bw,
                bh: bh,
                windows: windows,
                chimney: rng() < 0.4,
                chimneyH: 10 + rng() * 26,
                pitched: rng() < 0.5
            });
            x += bw + 6 + rng() * 10;
        }
    }

    function drawSkyline(ctx, trackY) {
        skyline.forEach(function (building) {
            var y = trackY - building.bh;
            ctx.fillStyle = '#241a12';
            ctx.fillRect(building.x, y, building.bw, building.bh);
            ctx.strokeStyle = 'rgba(199, 154, 74, 0.08)';
            ctx.lineWidth = 1;
            ctx.strokeRect(building.x + 0.5, y + 0.5, building.bw - 1, building.bh - 1);

            if (building.pitched) {
                ctx.beginPath();
                ctx.moveTo(building.x - 3, y);
                ctx.lineTo(building.x + building.bw / 2, y - 9);
                ctx.lineTo(building.x + building.bw + 3, y);
                ctx.closePath();
                ctx.fillStyle = '#1b130c';
                ctx.fill();
            }

            if (building.chimney) {
                var chx = building.x + building.bw * 0.68;
                ctx.fillStyle = '#1b130c';
                ctx.fillRect(chx, y - building.chimneyH, 5, building.chimneyH);
                ctx.fillStyle = 'rgba(238, 226, 203, 0.05)';
                for (var p = 0; p < 3; p += 1) {
                    ctx.beginPath();
                    ctx.arc(chx + 2 + p * 4, y - building.chimneyH - 4 - p * 5, 2 + p * 1.5, 0, Math.PI * 2);
                    ctx.fill();
                }
            }

            building.windows.forEach(function (windowItem) {
                ctx.fillStyle = windowItem.warm ? 'rgba(242, 184, 107, 0.32)' : 'rgba(199, 154, 74, 0.26)';
                ctx.fillRect(building.x + windowItem.x, y + windowItem.y, 2.5, 3);
            });
        });
    }

    function drawStation(ctx, trackY) {
        var bx = roadW * 0.01;
        var bw = Math.min(roadW * 0.19, 92);
        var bh = Math.min(roadH * 0.32, 76);
        var by = trackY - bh;

        ctx.fillStyle = '#2b1e14';
        ctx.fillRect(bx, by, bw, bh);
        ctx.strokeStyle = 'rgba(199, 154, 74, 0.26)';
        ctx.lineWidth = 1;
        ctx.strokeRect(bx + 0.5, by + 0.5, bw - 1, bh - 1);

        ctx.beginPath();
        ctx.moveTo(bx - 4, by);
        ctx.lineTo(bx + bw / 2, by - 12);
        ctx.lineTo(bx + bw + 4, by);
        ctx.closePath();
        ctx.fillStyle = '#1b130c';
        ctx.fill();
        ctx.strokeStyle = 'rgba(199, 154, 74, 0.3)';
        ctx.stroke();

        for (var i = 0; i < 3; i += 1) {
            var wx = bx + 8 + i * ((bw - 20) / 2);
            var wy = by + bh * 0.42;
            ctx.fillStyle = 'rgba(242, 184, 107, 0.42)';
            ctx.beginPath();
            ctx.moveTo(wx, wy + 14);
            ctx.lineTo(wx, wy);
            ctx.arc(wx + 5, wy, 5, Math.PI, 0);
            ctx.lineTo(wx + 10, wy + 14);
            ctx.closePath();
            ctx.fill();
            ctx.strokeStyle = 'rgba(199, 154, 74, 0.4)';
            ctx.stroke();
        }

        ctx.fillStyle = 'rgba(239, 196, 120, 0.8)';
        ctx.font = '6px "IBM Plex Mono", ui-monospace, monospace';
        ctx.fillText('UESTC', bx + 10, by + 12);
        ctx.fillStyle = 'rgba(214, 192, 155, 0.7)';
        ctx.font = '5px "IBM Plex Mono", ui-monospace, monospace';
        ctx.fillText('2015–22', bx + 10, by + 20);
        ctx.font = '6px "IBM Plex Mono", ui-monospace, monospace';

        var canopyX0 = bx;
        var canopyX1 = roadW * 0.34;
        var canopyY = trackY - 108;
        var canopyMid = (canopyX0 + canopyX1) / 2;

        ctx.beginPath();
        ctx.moveTo(canopyX0, canopyY + 10);
        ctx.quadraticCurveTo(canopyMid, canopyY - 8, canopyX1, canopyY + 10);
        ctx.lineTo(canopyX1, canopyY + 14);
        ctx.quadraticCurveTo(canopyMid, canopyY - 4, canopyX0, canopyY + 14);
        ctx.closePath();
        ctx.fillStyle = 'rgba(199, 154, 74, 0.11)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(239, 196, 120, 0.55)';
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.fillStyle = 'rgba(36, 26, 18, 0.2)';
        ctx.beginPath();
        ctx.moveTo(canopyX0, canopyY + 12);
        ctx.quadraticCurveTo(canopyMid, canopyY - 2, canopyX1, canopyY + 12);
        ctx.lineTo(canopyX1, canopyY + 14);
        ctx.quadraticCurveTo(canopyMid, canopyY, canopyX0, canopyY + 14);
        ctx.closePath();
        ctx.fill();

        ctx.strokeStyle = 'rgba(199, 154, 74, 0.22)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(canopyX0 + 4, canopyY + 14);
        for (var scallopX = canopyX0 + 10; scallopX < canopyX1; scallopX += 12) {
            ctx.quadraticCurveTo(scallopX - 4, canopyY + 18, scallopX, canopyY + 14);
        }
        ctx.stroke();

        for (var ribX = canopyX0 + 20; ribX < canopyX1; ribX += 24) {
            var ribT = (ribX - canopyX0) / (canopyX1 - canopyX0);
            var ribY = canopyY + 10 - Math.sin(ribT * Math.PI) * 18;
            ctx.strokeStyle = 'rgba(199, 154, 74, 0.18)';
            ctx.beginPath();
            ctx.moveTo(ribX, ribY + 3);
            ctx.lineTo(ribX, canopyY + 14);
            ctx.stroke();
        }

        [canopyX0 + 12, canopyMid, canopyX1 - 12].forEach(function (colX) {
            ctx.strokeStyle = '#4a3520';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(colX, canopyY + 12);
            ctx.lineTo(colX, trackY);
            ctx.stroke();
            ctx.strokeStyle = 'rgba(199, 154, 74, 0.45)';
            ctx.lineWidth = 0.7;
            ctx.beginPath();
            ctx.moveTo(colX - 1.5, canopyY + 14);
            ctx.lineTo(colX - 1.5, trackY);
            ctx.stroke();
            ctx.fillStyle = 'rgba(199, 154, 74, 0.35)';
            ctx.fillRect(colX - 3.5, trackY - 3, 7, 3);
        });

        [canopyX0 + 34, canopyMid, canopyX1 - 34].forEach(function (lampX) {
            var lampY = canopyY + 20;
            var lampGlow = ctx.createRadialGradient(lampX, lampY, 0, lampX, lampY, 10);
            lampGlow.addColorStop(0, 'rgba(242, 184, 107, 0.2)');
            lampGlow.addColorStop(1, 'rgba(242, 184, 107, 0)');
            ctx.fillStyle = lampGlow;
            ctx.beginPath();
            ctx.arc(lampX, lampY, 10, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = 'rgba(255, 236, 196, 0.85)';
            ctx.beginPath();
            ctx.arc(lampX, lampY, 1.6, 0, Math.PI * 2);
            ctx.fill();
        });

        var platformClockX = roadW * 0.21;
        var platformClockY = canopyY + 25;
        ctx.strokeStyle = '#4a3520';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(platformClockX, canopyY + 8);
        ctx.lineTo(platformClockX, platformClockY - 6);
        ctx.stroke();
        ctx.fillStyle = '#241a12';
        ctx.beginPath();
        ctx.arc(platformClockX, platformClockY, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(239, 196, 120, 0.6)';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(platformClockX, platformClockY);
        ctx.lineTo(platformClockX, platformClockY - 4);
        ctx.moveTo(platformClockX, platformClockY);
        ctx.lineTo(platformClockX + 3, platformClockY + 2);
        ctx.stroke();
    }

    function drawStationPlaque(ctx, x, y, title, sub) {
        ctx.save();
        ctx.font = '600 7.5px "IBM Plex Mono", ui-monospace, monospace';
        var tw = ctx.measureText(title).width;
        ctx.font = '5.5px "IBM Plex Mono", ui-monospace, monospace';
        var sw = sub ? ctx.measureText(sub).width : 0;
        var w = Math.max(tw, sw) + 12;
        var h = sub ? 17 : 11;
        ctx.fillStyle = 'rgba(26, 18, 12, 0.88)';
        roundRect(ctx, x - w / 2, y - h + 2, w, h, 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(199, 154, 74, 0.55)';
        ctx.lineWidth = 0.7;
        ctx.stroke();
        ctx.textAlign = 'center';
        ctx.fillStyle = 'rgba(239, 196, 120, 0.95)';
        ctx.font = '600 7.5px "IBM Plex Mono", ui-monospace, monospace';
        ctx.fillText(title, x, y - 2);
        if (sub) {
            ctx.fillStyle = 'rgba(214, 192, 155, 0.8)';
            ctx.font = '5.5px "IBM Plex Mono", ui-monospace, monospace';
            ctx.fillText(sub, x, y + 5);
        }
        ctx.restore();
    }

    function drawNeuronTree(ctx, x, baseY) {
        var s = clamp(roadW / 700, 0.7, 0.95);
        var now = performance.now();
        ctx.save();
        ctx.translate(x, baseY);
        ctx.scale(s, s);

        ctx.fillStyle = '#5b3b1c';
        roundRect(ctx, -18, -5, 36, 5, 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(199, 154, 74, 0.5)';
        ctx.lineWidth = 0.8;
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(-17, -5);
        ctx.bezierCurveTo(-17, -34, -8, -46, 0, -46);
        ctx.bezierCurveTo(8, -46, 17, -34, 17, -5);
        ctx.closePath();
        ctx.fillStyle = 'rgba(63, 111, 104, 0.09)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(199, 154, 74, 0.42)';
        ctx.stroke();

        var nodes = [[-9, -15], [9, -17], [-5, -28], [6, -33], [0, -40], [-13, -30], [13, -27]];
        ctx.strokeStyle = 'rgba(199, 154, 74, 0.65)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, -5);
        ctx.quadraticCurveTo(-3, -18, -9, -15);
        ctx.moveTo(0, -5);
        ctx.quadraticCurveTo(3, -18, 9, -17);
        ctx.moveTo(0, -5);
        ctx.quadraticCurveTo(-2, -25, -5, -28);
        ctx.moveTo(0, -5);
        ctx.quadraticCurveTo(1, -24, 6, -33);
        ctx.moveTo(-5, -28);
        ctx.quadraticCurveTo(-3, -35, 0, -40);
        ctx.moveTo(-9, -15);
        ctx.quadraticCurveTo(-12, -24, -13, -30);
        ctx.moveTo(9, -17);
        ctx.quadraticCurveTo(11, -22, 13, -27);
        ctx.stroke();

        var pulse = 0.65 + Math.sin(now / 800) * 0.18;
        nodes.forEach(function (node) {
            var r = 1.5 + (node[1] < -30 ? 0.5 : 0);
            var glow = ctx.createRadialGradient(node[0], node[1], 0, node[0], node[1], 6);
            glow.addColorStop(0, 'rgba(63, 111, 104, ' + (0.3 * pulse).toFixed(3) + ')');
            glow.addColorStop(1, 'rgba(63, 111, 104, 0)');
            ctx.fillStyle = glow;
            ctx.beginPath();
            ctx.arc(node[0], node[1], 6, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = 'rgba(239, 196, 120, 0.9)';
            ctx.beginPath();
            ctx.arc(node[0], node[1], r, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = 'rgba(63, 111, 104, 0.8)';
            ctx.lineWidth = 0.8;
            ctx.stroke();
        });

        ctx.fillStyle = 'rgba(239, 196, 120, 0.75)';
        ctx.font = '5px "IBM Plex Mono", ui-monospace, monospace';
        ctx.textAlign = 'center';
        ctx.fillText('DNN', 0, -47);
        ctx.restore();
    }

    function drawForecourt(ctx, trackY) {
        var roadY = trackY + Math.min(24, (roadH - trackY) * 0.42);
        var x0 = roadW * 0.38;
        var x1 = roadW * 0.62;
        ctx.fillStyle = 'rgba(18, 12, 8, 0.88)';
        roundRect(ctx, x0, roadY - 2, x1 - x0, 6, 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(199, 154, 74, 0.35)';
        ctx.lineWidth = 0.8;
        ctx.stroke();
        ctx.fillStyle = 'rgba(199, 154, 74, 0.12)';
        ctx.fillRect(x0 + 5, roadY + 1, x1 - x0 - 10, 1);
        return roadY;
    }

    function drawTruck(ctx, x, baseY) {
        var s = clamp(roadW / 460, 1.0, 1.4);
        var now = performance.now();
        ctx.save();
        ctx.translate(x, baseY);
        ctx.scale(s, s);

        ctx.fillStyle = 'rgba(22, 15, 10, 0.88)';
        roundRect(ctx, -30, -3, 60, 5, 1.5);
        ctx.fill();
        ctx.strokeStyle = 'rgba(199, 154, 74, 0.35)';
        ctx.lineWidth = 0.7;
        ctx.stroke();
        ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
        ctx.beginPath();
        ctx.ellipse(0, 2, 28, 3, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#1b130c';
        ctx.beginPath();
        ctx.arc(-14, -5, 4.5, 0, Math.PI * 2);
        ctx.arc(12, -5, 4.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(199, 154, 74, 0.65)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(-14, -5, 2, 0, Math.PI * 2);
        ctx.arc(12, -5, 2, 0, Math.PI * 2);
        ctx.stroke();

        var cargo = ctx.createLinearGradient(0, -20, 0, -5);
        cargo.addColorStop(0, '#b3813a');
        cargo.addColorStop(1, '#5b3b1c');
        ctx.fillStyle = cargo;
        ctx.strokeStyle = 'rgba(199, 154, 74, 0.65)';
        roundRect(ctx, -22, -19, 30, 13, 2);
        ctx.fill();
        ctx.stroke();
        ctx.strokeStyle = 'rgba(36, 26, 18, 0.45)';
        ctx.lineWidth = 0.7;
        [-16, -8, 0].forEach(function (slatX) {
            ctx.beginPath();
            ctx.moveTo(slatX, -18);
            ctx.lineTo(slatX, -6);
            ctx.stroke();
        });

        ctx.fillStyle = '#3f6f68';
        ctx.strokeStyle = 'rgba(239, 196, 120, 0.55)';
        roundRect(ctx, 8, -17, 16, 11, 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = 'rgba(242, 184, 107, 0.65)';
        roundRect(ctx, 11, -14, 6, 5, 1);
        ctx.fill();

        ctx.strokeStyle = 'rgba(199, 154, 74, 0.75)';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(18, -17);
        ctx.lineTo(18, -27);
        ctx.stroke();
        ctx.fillStyle = '#2b1e14';
        ctx.beginPath();
        ctx.arc(18, -29, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(63, 111, 104, 0.75)';
        ctx.beginPath();
        ctx.arc(18, -29, 5, Math.PI * 0.15, Math.PI * 1.85);
        ctx.stroke();

        ctx.fillStyle = 'rgba(255, 236, 196, 0.75)';
        ctx.beginPath();
        ctx.arc(23, -9, 1.3, 0, Math.PI * 2);
        ctx.fill();

        ctx.globalAlpha = 0.55;
        ctx.strokeStyle = 'rgba(63, 111, 104, 0.55)';
        ctx.beginPath();
        ctx.moveTo(18, -29);
        ctx.lineTo(18 + Math.cos(now / 900) * 7, -29 + Math.sin(now / 900) * 4);
        ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.restore();
    }

    function drawMiniStation(ctx, trackY, x, w, title, sub, options) {
        options = options || {};
        var major = !!options.major;
        var h = major ? Math.max(48, Math.min(62, roadH * 0.2)) : Math.max(32, Math.min(46, roadH * 0.16));
        var bw = Math.max(30, w * (major ? 0.42 : 0.34));
        var bx = x + w * 0.30;
        var by = trackY - h;
        var canopyY = by + 2;

        ctx.fillStyle = 'rgba(22, 15, 10, 0.78)';
        ctx.fillRect(x, trackY - 2, w, 6);
        ctx.strokeStyle = 'rgba(199, 154, 74, 0.3)';
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(x, trackY - 2);
        ctx.lineTo(x + w, trackY - 2);
        ctx.stroke();

        ctx.fillStyle = '#2b1e14';
        ctx.fillRect(bx, by, bw, h);
        ctx.strokeStyle = 'rgba(199, 154, 74, 0.28)';
        ctx.strokeRect(bx + 0.5, by + 0.5, bw - 1, h - 1);

        ctx.beginPath();
        ctx.moveTo(bx - 4, by);
        ctx.lineTo(bx + bw / 2, by - 10);
        ctx.lineTo(bx + bw + 4, by);
        ctx.closePath();
        ctx.fillStyle = '#1b130c';
        ctx.fill();
        ctx.strokeStyle = 'rgba(199, 154, 74, 0.32)';
        ctx.stroke();

        var winCount = major ? 3 : 2;
        for (var win = 0; win < winCount; win += 1) {
            var winX = bx + 5 + win * ((bw - 14) / Math.max(1, winCount - 1));
            ctx.fillStyle = 'rgba(242, 184, 107, 0.42)';
            roundRect(ctx, winX, by + h * 0.42, 7, 9, 1.5);
            ctx.fill();
            ctx.strokeStyle = 'rgba(199, 154, 74, 0.4)';
            ctx.lineWidth = 0.6;
            ctx.stroke();
        }

        if (major) {
            ctx.fillStyle = '#1b130c';
            roundRect(ctx, bx + bw / 2 - 4, by + h - 13, 8, 13, 1);
            ctx.fill();
        }

        ctx.strokeStyle = '#4a3520';
        ctx.lineWidth = 2;
        [x + 4, x + w - 4].forEach(function (colX) {
            ctx.beginPath();
            ctx.moveTo(colX, canopyY);
            ctx.lineTo(colX, trackY);
            ctx.stroke();
        });
        ctx.beginPath();
        ctx.moveTo(x, canopyY + 6);
        ctx.quadraticCurveTo(x + w / 2, canopyY - 4, x + w, canopyY + 6);
        ctx.lineTo(x + w, canopyY + 9);
        ctx.quadraticCurveTo(x + w / 2, canopyY - 1, x, canopyY + 9);
        ctx.closePath();
        ctx.fillStyle = 'rgba(199, 154, 74, 0.13)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(199, 154, 74, 0.5)';
        ctx.lineWidth = 0.8;
        ctx.stroke();

        ctx.strokeStyle = 'rgba(199, 154, 74, 0.2)';
        ctx.lineWidth = 0.6;
        for (var rib = x + 12; rib < x + w; rib += 16) {
            ctx.beginPath();
            ctx.moveTo(rib, canopyY + 2);
            ctx.lineTo(rib, canopyY + 9);
            ctx.stroke();
        }

        var lampX = x + w * 0.5;
        var lampY = canopyY + 8;
        var glow = ctx.createRadialGradient(lampX, lampY, 0, lampX, lampY, 10);
        glow.addColorStop(0, 'rgba(242, 184, 107, 0.18)');
        glow.addColorStop(1, 'rgba(242, 184, 107, 0)');
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(lampX, lampY, 10, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(255, 236, 196, 0.8)';
        ctx.beginPath();
        ctx.arc(lampX, lampY, 1.4, 0, Math.PI * 2);
        ctx.fill();

        var clockX = bx + bw / 2;
        var clockY = by + 8;
        if (options.clock && major) {
            ctx.fillStyle = '#2b1e14';
            ctx.fillRect(clockX - 5, by - 22, 10, 22);
            ctx.strokeStyle = 'rgba(199, 154, 74, 0.35)';
            ctx.strokeRect(clockX - 4.5, by - 21.5, 9, 21);
            ctx.beginPath();
            ctx.moveTo(clockX - 8, by - 22);
            ctx.lineTo(clockX, by - 30);
            ctx.lineTo(clockX + 8, by - 22);
            ctx.closePath();
            ctx.fillStyle = '#1b130c';
            ctx.fill();
            ctx.stroke();
            clockY = by - 18;
        }

        if (options.clock) {
            ctx.fillStyle = '#fbf4e3';
            ctx.strokeStyle = 'rgba(199, 154, 74, 0.75)';
            ctx.lineWidth = 0.9;
            ctx.beginPath();
            ctx.arc(clockX, clockY, 5, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            ctx.strokeStyle = '#4a3520';
            ctx.lineWidth = 0.8;
            ctx.beginPath();
            ctx.moveTo(clockX, clockY);
            ctx.lineTo(clockX, clockY - 3);
            ctx.moveTo(clockX, clockY);
            ctx.lineTo(clockX + 2, clockY + 1);
            ctx.stroke();
        }

        drawStationPlaque(ctx, x + w / 2, by - (major ? 38 : 6), title, sub);
    }

    function drawPlatformDetails(ctx, trackY) {
        var personX = roadW * 0.045;
        ctx.save();
        ctx.translate(personX, trackY - 2);
        ctx.scale(1.1, 1.1);

        ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
        ctx.beginPath();
        ctx.ellipse(0, 1, 6, 2, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = '#241a12';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-2, -8);
        ctx.lineTo(-3, -1);
        ctx.moveTo(2, -8);
        ctx.lineTo(3, -1);
        ctx.stroke();

        ctx.fillStyle = '#3a2a1c';
        roundRect(ctx, -6, -22, 12, 14, 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(199, 154, 74, 0.55)';
        ctx.lineWidth = 0.7;
        ctx.stroke();
        ctx.fillStyle = 'rgba(199, 154, 74, 0.8)';
        [-19, -15].forEach(function (buttonY) {
            ctx.beginPath();
            ctx.arc(-1.5, buttonY, 0.7, 0, Math.PI * 2);
            ctx.fill();
        });

        ctx.fillStyle = '#c79a4a';
        ctx.beginPath();
        ctx.arc(0, -26, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(242, 184, 107, 0.7)';
        ctx.beginPath();
        ctx.arc(0, -20, 1, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#241a12';
        roundRect(ctx, -4, -31, 8, 5, 1);
        ctx.fill();
        ctx.fillStyle = '#8f2f2f';
        roundRect(ctx, -4.5, -31.5, 9, 1.4, 0.5);
        ctx.fill();

        ctx.strokeStyle = 'rgba(199, 154, 74, 0.75)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(5, -18);
        ctx.lineTo(9, -13);
        ctx.stroke();
        var lanternGlow = ctx.createRadialGradient(10, -11, 0, 10, -11, 9);
        lanternGlow.addColorStop(0, 'rgba(255, 220, 150, 0.22)');
        lanternGlow.addColorStop(1, 'rgba(255, 220, 150, 0)');
        ctx.fillStyle = lanternGlow;
        ctx.beginPath();
        ctx.arc(10, -11, 9, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(255, 236, 196, 0.9)';
        ctx.beginPath();
        ctx.arc(10, -11, 1.5, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();

        var luggageX = roadW * 0.16;
        ctx.fillStyle = '#4a2f1d';
        roundRect(ctx, luggageX, trackY - 7, 11, 6, 1);
        ctx.fill();
        ctx.strokeStyle = 'rgba(199, 154, 74, 0.65)';
        ctx.lineWidth = 0.8;
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(luggageX + 1, trackY - 4);
        ctx.lineTo(luggageX + 10, trackY - 4);
        ctx.stroke();

        ctx.fillStyle = '#3a2a1c';
        roundRect(ctx, luggageX + 13, trackY - 5, 8, 4, 1);
        ctx.fill();
        ctx.stroke();
    }

    function drawClockTower(ctx, trackY) {
        var tx = roadW * 0.47;
        var width = 20;
        var height = Math.min(78, roadH * 0.34);
        var y = trackY - height;

        ctx.fillStyle = '#241a12';
        ctx.fillRect(tx - width / 2, y, width, height);
        ctx.strokeStyle = 'rgba(199, 154, 74, 0.28)';
        ctx.strokeRect(tx - width / 2, y, width, height);

        ctx.beginPath();
        ctx.moveTo(tx - width / 2 - 4, y);
        ctx.lineTo(tx, y - 10);
        ctx.lineTo(tx + width / 2 + 4, y);
        ctx.closePath();
        ctx.fillStyle = '#1b130c';
        ctx.fill();
        ctx.strokeStyle = 'rgba(199, 154, 74, 0.35)';
        ctx.stroke();

        var faceY = y + 16;
        ctx.fillStyle = 'rgba(239, 196, 120, 0.13)';
        ctx.beginPath();
        ctx.arc(tx, faceY, 6.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(239, 196, 120, 0.55)';
        ctx.beginPath();
        ctx.arc(tx, faceY, 6.5, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(tx, faceY);
        ctx.lineTo(tx, faceY - 4);
        ctx.moveTo(tx, faceY);
        ctx.lineTo(tx + 3, faceY + 2);
        ctx.stroke();

        drawGear(ctx, tx, y + height - 12, 5, 8, 'rgba(199, 154, 74, 0.42)', 0.7, performance.now() / 4200);
    }

    function drawGasLamps(ctx, trackY) {
        [roadW * 0.05, roadW * 0.18, roadW * 0.52, roadW * 0.93].forEach(function (x) {
            ctx.strokeStyle = '#4a3520';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(x, trackY);
            ctx.lineTo(x, trackY - 30);
            ctx.stroke();

            ctx.fillStyle = '#241a12';
            roundRect(ctx, x - 4, trackY - 39, 8, 10, 2);
            ctx.fill();
            ctx.strokeStyle = 'rgba(199, 154, 74, 0.55)';
            ctx.lineWidth = 0.8;
            ctx.stroke();

            var glow = ctx.createRadialGradient(x, trackY - 33, 0, x, trackY - 33, 14);
            glow.addColorStop(0, 'rgba(242, 184, 107, 0.22)');
            glow.addColorStop(1, 'rgba(242, 184, 107, 0)');
            ctx.fillStyle = glow;
            ctx.beginPath();
            ctx.arc(x, trackY - 33, 14, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = 'rgba(255, 236, 196, 0.9)';
            ctx.beginPath();
            ctx.arc(x, trackY - 34, 1.8, 0, Math.PI * 2);
            ctx.fill();
        });
    }

    function drawTunnel(ctx, x, w, trackY, label) {
        var h = Math.min(54, roadH * 0.2);
        var top = trackY - h;

        ctx.fillStyle = '#241a12';
        ctx.beginPath();
        ctx.moveTo(x, trackY);
        ctx.lineTo(x, top + 10);
        ctx.quadraticCurveTo(x + w / 2, top - 6, x + w, top + 10);
        ctx.lineTo(x + w, trackY);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = 'rgba(199, 154, 74, 0.38)';
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.fillStyle = '#090604';
        ctx.beginPath();
        ctx.moveTo(x + w * 0.14, trackY);
        ctx.lineTo(x + w * 0.14, top + 18);
        ctx.quadraticCurveTo(x + w / 2, top + 2, x + w * 0.86, top + 18);
        ctx.lineTo(x + w * 0.86, trackY);
        ctx.closePath();
        ctx.fill();

        ctx.strokeStyle = 'rgba(199, 154, 74, 0.45)';
        ctx.beginPath();
        ctx.moveTo(x + w * 0.22, top + 20);
        ctx.quadraticCurveTo(x + w / 2, top + 8, x + w * 0.78, top + 20);
        ctx.stroke();

        ctx.fillStyle = 'rgba(199, 154, 74, 0.5)';
        for (var rivet = 0; rivet < 4; rivet += 1) {
            ctx.beginPath();
            ctx.arc(x + 5 + rivet * (w - 10) / 3, top + 16, 0.8, 0, Math.PI * 2);
            ctx.fill();
        }

        if (label) {
            ctx.fillStyle = 'rgba(239, 196, 120, 0.7)';
            ctx.font = '5.5px "IBM Plex Mono", ui-monospace, monospace';
            ctx.textAlign = 'center';
            ctx.fillText(label, x + w / 2, top - 5);
        }
    }

    function drawCheckpoint(ctx, trackY) {
        var cx = roadW * 0.46;
        var half = roadW * 0.075;
        var top = trackY - 58;
        var left = cx - half;
        var right = cx + half;

        ctx.strokeStyle = '#4a3520';
        ctx.lineWidth = 3;
        [left, right].forEach(function (postX) {
            ctx.beginPath();
            ctx.moveTo(postX, top);
            ctx.lineTo(postX, trackY);
            ctx.stroke();
            ctx.strokeStyle = 'rgba(199, 154, 74, 0.4)';
            ctx.lineWidth = 0.8;
            ctx.beginPath();
            ctx.moveTo(postX - 1.2, top + 2);
            ctx.lineTo(postX - 1.2, trackY);
            ctx.stroke();
            ctx.strokeStyle = '#4a3520';
            ctx.lineWidth = 3;
        });

        ctx.strokeStyle = '#4a3520';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(left, top);
        ctx.lineTo(right, top);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(199, 154, 74, 0.5)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(left + 3, top + 2);
        ctx.lineTo(right - 3, top + 2);
        ctx.stroke();

        ctx.strokeStyle = 'rgba(199, 154, 74, 0.22)';
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(left + 6, top + 8);
        ctx.lineTo(right - 6, top + 18);
        ctx.moveTo(right - 6, top + 8);
        ctx.lineTo(left + 6, top + 18);
        ctx.stroke();

        var lampX = cx;
        var lampY = top + 12;
        var glow = ctx.createRadialGradient(lampX, lampY, 0, lampX, lampY, 11);
        glow.addColorStop(0, 'rgba(63, 111, 104, 0.25)');
        glow.addColorStop(1, 'rgba(63, 111, 104, 0)');
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(lampX, lampY, 11, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(239, 196, 120, 0.85)';
        ctx.beginPath();
        ctx.arc(lampX, lampY, 1.5, 0, Math.PI * 2);
        ctx.fill();

        var boothW = roadW * 0.045;
        var boothH = 25;
        var boothX = left - boothW - 4;
        var boothY = trackY - boothH;
        ctx.fillStyle = '#2b1e14';
        ctx.fillRect(boothX, boothY, boothW, boothH);
        ctx.strokeStyle = 'rgba(199, 154, 74, 0.35)';
        ctx.lineWidth = 0.8;
        ctx.strokeRect(boothX + 0.5, boothY + 0.5, boothW - 1, boothH - 1);
        ctx.fillStyle = 'rgba(242, 184, 107, 0.45)';
        ctx.fillRect(boothX + 4, boothY + 7, boothW - 8, 6);
        ctx.fillStyle = '#1b130c';
        ctx.beginPath();
        ctx.moveTo(boothX - 2, boothY);
        ctx.lineTo(boothX + boothW / 2, boothY - 6);
        ctx.lineTo(boothX + boothW + 2, boothY);
        ctx.closePath();
        ctx.fill();

        ctx.save();
        ctx.translate(boothX + boothW, boothY + 10);
        ctx.rotate(-0.28);
        ctx.fillStyle = 'rgba(199, 154, 74, 0.45)';
        ctx.fillRect(0, 0, 22, 3);
        ctx.fillStyle = 'rgba(143, 47, 47, 0.55)';
        ctx.fillRect(4, 0, 4, 3);
        ctx.fillRect(12, 0, 4, 3);
        ctx.restore();

        drawStationPlaque(ctx, cx, top - 5, 'CITYU SZ × HON HAI', 'CHECKPOINT · 2022–23');
    }

    function drawMoEStack(ctx, x, baseY) {
        var s = clamp(roadW / 700, 0.75, 1.05);
        ctx.save();
        ctx.translate(x, baseY);
        ctx.scale(s, s);

        ctx.fillStyle = '#5b3b1c';
        roundRect(ctx, -16, -4, 32, 4, 1);
        ctx.fill();
        ctx.strokeStyle = 'rgba(199, 154, 74, 0.45)';
        ctx.lineWidth = 0.8;
        ctx.stroke();

        [-10, 0, 10].forEach(function (dx, index) {
            var drum = ctx.createLinearGradient(dx - 4, 0, dx + 4, 0);
            drum.addColorStop(0, '#5b3b1c');
            drum.addColorStop(0.5, '#c79a4a');
            drum.addColorStop(1, '#6b451f');
            ctx.fillStyle = drum;
            ctx.strokeStyle = 'rgba(239, 196, 120, 0.55)';
            roundRect(ctx, dx - 3.5, -17, 7, 13, 2);
            ctx.fill();
            ctx.stroke();
            ctx.fillStyle = '#fbf4e3';
            ctx.strokeStyle = 'rgba(169, 116, 43, 0.7)';
            ctx.lineWidth = 0.6;
            ctx.beginPath();
            ctx.arc(dx, -19, 2.1, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            ctx.strokeStyle = 'rgba(169, 116, 43, 0.6)';
            ctx.beginPath();
            ctx.moveTo(dx, -17);
            ctx.lineTo(dx, -10);
            ctx.stroke();
        });

        ctx.fillStyle = 'rgba(239, 196, 120, 0.8)';
        ctx.font = '4.5px "IBM Plex Mono", ui-monospace, monospace';
        ctx.textAlign = 'center';
        ctx.fillText('RT-MoE', 0, -23);
        ctx.restore();
    }

    function drawBackdrop(ctx, trackY) {
        var sky = ctx.createLinearGradient(0, 0, 0, trackY);
        sky.addColorStop(0, '#17110c');
        sky.addColorStop(0.55, '#332417');
        sky.addColorStop(1, '#6b4526');
        ctx.fillStyle = sky;
        ctx.fillRect(0, 0, roadW, trackY);

        var ground = ctx.createLinearGradient(0, trackY, 0, roadH);
        ground.addColorStop(0, '#1c140d');
        ground.addColorStop(1, '#0f0a06');
        ctx.fillStyle = ground;
        ctx.fillRect(0, trackY, roadW, roadH - trackY);

        var moonX = roadW * 0.17;
        var moonY = roadH * 0.19;
        var moonR = Math.max(9, Math.min(roadW, roadH) * 0.055);
        var moonGlow = ctx.createRadialGradient(moonX, moonY, moonR * 0.3, moonX, moonY, moonR * 3.4);
        moonGlow.addColorStop(0, 'rgba(255, 236, 196, 0.22)');
        moonGlow.addColorStop(1, 'rgba(255, 236, 196, 0)');
        ctx.fillStyle = moonGlow;
        ctx.beginPath();
        ctx.arc(moonX, moonY, moonR * 3.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(255, 239, 204, 0.8)';
        ctx.beginPath();
        ctx.arc(moonX, moonY, moonR, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(120, 90, 55, 0.12)';
        ctx.beginPath();
        ctx.arc(moonX - moonR * 0.3, moonY - moonR * 0.2, moonR * 0.22, 0, Math.PI * 2);
        ctx.arc(moonX + moonR * 0.35, moonY + moonR * 0.25, moonR * 0.15, 0, Math.PI * 2);
        ctx.fill();

        drawGear(ctx, roadW * 0.09, roadH * 0.12, Math.min(roadW, roadH) * 0.07, 10, 'rgba(199, 154, 74, 0.09)', 1, 0.2);

        drawSkyline(ctx, trackY);
        drawTunnel(ctx, 0, roadW * 0.055, trackY, '');
        drawTunnel(ctx, roadW * 0.945, roadW * 0.055, trackY, 'NEXT');
        drawGasLamps(ctx, trackY);
        drawMiniStation(ctx, trackY, roadW * 0.04, roadW * 0.18, 'UESTC', 'START · 2015–22', {});
        drawNeuronTree(ctx, roadW * 0.21, trackY - 2);
        drawCheckpoint(ctx, trackY);
        drawMiniStation(ctx, trackY, roadW * 0.60, roadW * 0.33, 'CITYU MLAB', '2023–NOW', { clock: true, major: true });
        drawMoEStack(ctx, roadW * 0.665, trackY - 2);
    }

    function drawTrack(ctx, trackY) {
        ctx.fillStyle = '#3a2c20';
        ctx.fillRect(0, trackY - 8, roadW, 3);
        ctx.strokeStyle = 'rgba(199, 154, 74, 0.35)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, trackY - 8);
        ctx.lineTo(roadW, trackY - 8);
        ctx.stroke();

        ctx.fillStyle = 'rgba(16, 11, 7, 0.7)';
        ctx.fillRect(0, trackY + 7, roadW, roadH - trackY - 7);

        var spacing = 28;
        var offset = -(state.roadOffset * 0.8 % spacing);
        for (var x = -spacing; x < roadW + spacing; x += spacing) {
            var sleeperX = x + offset;
            ctx.fillStyle = '#2b1e14';
            ctx.fillRect(sleeperX, trackY + 1, 16, 5);
            ctx.strokeStyle = 'rgba(199, 154, 74, 0.1)';
            ctx.lineWidth = 0.7;
            ctx.strokeRect(sleeperX, trackY + 1, 16, 5);
        }

        ctx.fillStyle = 'rgba(199, 154, 74, 0.08)';
        for (var stone = 0; stone < 28; stone += 1) {
            var stoneX = (stone * 37 + 11) % roadW;
            var stoneY = trackY + 10 + ((stone * 13) % Math.max(1, roadH - trackY - 12));
            ctx.fillRect(stoneX, stoneY, 2, 1.5);
        }

        ctx.strokeStyle = 'rgba(199, 154, 74, 0.7)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, trackY + 0.5);
        ctx.lineTo(roadW, trackY + 0.5);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(242, 184, 107, 0.35)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, trackY + 2.5);
        ctx.lineTo(roadW, trackY + 2.5);
        ctx.stroke();

        if (state.instruction === 'exit') {
            ctx.strokeStyle = 'rgba(199, 154, 74, 0.6)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(roadW * 0.64, trackY);
            ctx.quadraticCurveTo(roadW * 0.78, trackY, roadW * 0.94, trackY - 20);
            ctx.stroke();
            ctx.strokeStyle = 'rgba(242, 184, 107, 0.4)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(roadW * 0.64, trackY + 4);
            ctx.quadraticCurveTo(roadW * 0.78, trackY + 4, roadW * 0.94, trackY - 16);
            ctx.stroke();
        }
    }

    function drawSignals(ctx, trackY) {
        var danger = state.lastLatency > state.deadline || state.instruction === 'avoid' || state.instruction === 'pull';
        var x = roadW * 0.58;

        ctx.strokeStyle = '#4a3520';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(x, trackY);
        ctx.lineTo(x, trackY - 48);
        ctx.stroke();

        ctx.save();
        ctx.translate(x, trackY - 36);
        ctx.rotate(danger ? 0 : -0.55);
        ctx.fillStyle = danger ? 'rgba(143, 47, 47, 0.9)' : 'rgba(239, 196, 120, 0.85)';
        roundRect(ctx, 0, -2, 18, 4, 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(199, 154, 74, 0.55)';
        ctx.lineWidth = 0.8;
        ctx.stroke();
        ctx.restore();

        var lampY = trackY - 46;
        var glow = ctx.createRadialGradient(x, lampY, 0, x, lampY, 14);
        glow.addColorStop(0, danger ? 'rgba(143, 47, 47, 0.35)' : 'rgba(63, 111, 104, 0.32)');
        glow.addColorStop(1, 'rgba(143, 47, 47, 0)');
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(x, lampY, 14, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = danger ? '#8f2f2f' : '#3f6f68';
        ctx.beginPath();
        ctx.arc(x, lampY, 3.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(199, 154, 74, 0.65)';
        ctx.lineWidth = 0.8;
        ctx.stroke();

        ctx.fillStyle = 'rgba(199, 154, 74, 0.7)';
        ctx.font = '6px "IBM Plex Mono", ui-monospace, monospace';
        ctx.fillText('SIGNAL', x - 13, trackY - 56);

        if (state.instruction === 'exit') {
            var leverX = roadW * 0.75;
            ctx.strokeStyle = '#4a3520';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(leverX, trackY);
            ctx.lineTo(leverX, trackY - 24);
            ctx.stroke();
            ctx.save();
            ctx.translate(leverX, trackY - 24);
            ctx.rotate(-0.5);
            ctx.strokeStyle = 'rgba(199, 154, 74, 0.8)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(14, 0);
            ctx.stroke();
            ctx.restore();
            ctx.fillStyle = 'rgba(199, 154, 74, 0.7)';
            ctx.fillText('BRANCH', leverX - 10, trackY - 30);
        }
    }

    function robotGeometry() {
        var scale = clamp(roadW / 620, 0.85, 1.15);
        return {
            x: roadW * 0.52,
            baseY: roadH * 0.78 - 8,
            scale: scale
        };
    }

    function drawRobot(ctx) {
        var t = robotGeometry();
        var now = performance.now();
        var bob = Math.sin(now / 1100) * 0.6;
        var puffPhase = (now / 1600) % 1;

        ctx.save();
        ctx.translate(t.x, t.baseY + bob);
        ctx.scale(t.scale, t.scale);

        ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
        ctx.beginPath();
        ctx.ellipse(0, 1, 11, 3, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = 'rgba(199, 154, 74, 0.75)';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(-4, -10);
        ctx.lineTo(-5, -1);
        ctx.moveTo(4, -10);
        ctx.lineTo(5, -1);
        ctx.stroke();
        ctx.fillStyle = '#2b1e14';
        roundRect(ctx, -8, -2, 6, 3, 1);
        ctx.fill();
        roundRect(ctx, 2, -2, 6, 3, 1);
        ctx.fill();

        var body = ctx.createLinearGradient(0, -25, 0, -8);
        body.addColorStop(0, '#c79a4a');
        body.addColorStop(0.55, '#a9742b');
        body.addColorStop(1, '#6b451f');
        ctx.fillStyle = body;
        ctx.strokeStyle = 'rgba(239, 196, 120, 0.6)';
        roundRect(ctx, -9, -24, 18, 16, 4);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = 'rgba(199, 154, 74, 0.85)';
        [[-6, -21], [6, -21], [-6, -11], [6, -11]].forEach(function (rivet) {
            ctx.beginPath();
            ctx.arc(rivet[0], rivet[1], 0.7, 0, Math.PI * 2);
            ctx.fill();
        });

        ctx.fillStyle = 'rgba(242, 184, 107, 0.65)';
        roundRect(ctx, -4, -19, 8, 7, 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(42, 31, 21, 0.6)';
        ctx.stroke();
        ctx.fillStyle = 'rgba(42, 31, 21, 0.8)';
        ctx.font = '4px "IBM Plex Mono", ui-monospace, monospace';
        ctx.textAlign = 'center';
        ctx.fillText('ATER', 0, -14);
        ctx.textAlign = 'left';

        ctx.strokeStyle = 'rgba(199, 154, 74, 0.8)';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(-9, -21);
        ctx.lineTo(-14, -17);
        ctx.lineTo(-14, -11);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(9, -21);
        ctx.lineTo(14, -17);
        ctx.lineTo(15, -10);
        ctx.stroke();

        var lanternGlow = ctx.createRadialGradient(-15, -9, 0, -15, -9, 8);
        lanternGlow.addColorStop(0, 'rgba(255, 214, 140, 0.5)');
        lanternGlow.addColorStop(1, 'rgba(255, 214, 140, 0)');
        ctx.fillStyle = lanternGlow;
        ctx.beginPath();
        ctx.arc(-15, -9, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#241a12';
        roundRect(ctx, -18, -11, 6, 7, 1);
        ctx.fill();
        ctx.strokeStyle = 'rgba(199, 154, 74, 0.7)';
        ctx.stroke();
        ctx.fillStyle = 'rgba(255, 236, 196, 0.9)';
        ctx.beginPath();
        ctx.arc(-15, -8, 1.3, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#8a5a2b';
        ctx.strokeStyle = 'rgba(199, 154, 74, 0.75)';
        ctx.lineWidth = 1;
        roundRect(ctx, -6, -34, 12, 10, 3);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = 'rgba(255, 236, 196, 0.95)';
        ctx.shadowColor = 'rgba(255, 214, 140, 0.8)';
        ctx.shadowBlur = 5;
        ctx.beginPath();
        ctx.arc(-2.6, -29, 1.2, 0, Math.PI * 2);
        ctx.arc(2.6, -29, 1.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;

        ctx.fillStyle = '#2b1e14';
        roundRect(ctx, -4, -40, 8, 6, 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(199, 154, 74, 0.6)';
        ctx.stroke();
        ctx.fillStyle = '#241a12';
        roundRect(ctx, -4, -38, 2, 2, 0.5);
        ctx.fill();

        ctx.fillStyle = '#241a12';
        roundRect(ctx, -9, -33, 3, 9, 1);
        ctx.fill();
        ctx.fillStyle = 'rgba(238, 226, 203, ' + ((1 - puffPhase) * 0.12).toFixed(3) + ')';
        ctx.beginPath();
        ctx.arc(-8 - puffPhase * 3, -35 - puffPhase * 7, 1.5 + puffPhase * 2.5, 0, Math.PI * 2);
        ctx.fill();

        drawGear(ctx, 8, -22, 3, 6, 'rgba(199, 154, 74, 0.75)', 0.6, now / 1000);

        ctx.restore();
    }

    function drawTrainWheel(ctx, x, y, radius, angle) {
        ctx.fillStyle = '#1b130c';
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = 'rgba(199, 154, 74, 0.75)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(x, y, radius * 0.78, 0, Math.PI * 2);
        ctx.stroke();

        for (var spoke = 0; spoke < 6; spoke += 1) {
            var a = angle + spoke * (Math.PI / 3);
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x + Math.cos(a) * radius * 0.72, y + Math.sin(a) * radius * 0.72);
            ctx.stroke();
        }

        ctx.fillStyle = '#c79a4a';
        ctx.beginPath();
        ctx.arc(x, y, 1.6, 0, Math.PI * 2);
        ctx.fill();
    }

    function drawLocomotive(ctx) {
        var t = trainGeometry();
        var now = performance.now();
        var braking = state.lastLatency > state.deadline || state.speed < 0.6;
        var wheelAngle = state.roadOffset * 0.5;

        ctx.save();
        ctx.translate(t.cx, t.trackY);
        ctx.scale(t.scale, t.scale);
        ctx.translate(0, Math.sin(now / 900) * 0.5);

        // Passenger carriage and tender: turn the locomotive into a real express.
        ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
        ctx.beginPath();
        ctx.ellipse(-161, 2, 38, 5, 0, 0, Math.PI * 2);
        ctx.fill();
        drawTrainWheel(ctx, -184, -8, 8, wheelAngle + 0.2);
        drawTrainWheel(ctx, -136, -8, 8, wheelAngle - 0.2);

        var carriageGrad = ctx.createLinearGradient(0, -46, 0, -4);
        carriageGrad.addColorStop(0, '#733326');
        carriageGrad.addColorStop(1, '#3f1c16');
        ctx.fillStyle = carriageGrad;
        ctx.strokeStyle = 'rgba(199, 154, 74, 0.6)';
        ctx.lineWidth = 1;
        roundRect(ctx, -198, -44, 76, 36, 4);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#241a12';
        roundRect(ctx, -201, -49, 82, 6, 3);
        ctx.fill();
        ctx.strokeStyle = 'rgba(239, 196, 120, 0.45)';
        ctx.stroke();

        for (var win = 0; win < 5; win += 1) {
            ctx.fillStyle = 'rgba(242, 184, 107, 0.58)';
            roundRect(ctx, -191 + win * 14, -36, 9, 11, 2);
            ctx.fill();
            ctx.strokeStyle = 'rgba(199, 154, 74, 0.55)';
            ctx.stroke();
        }

        ctx.strokeStyle = 'rgba(199, 154, 74, 0.45)';
        ctx.beginPath();
        ctx.moveTo(-196, -10);
        ctx.lineTo(-122, -10);
        ctx.stroke();
        ctx.fillStyle = 'rgba(239, 196, 120, 0.55)';
        for (var cr = 0; cr < 6; cr += 1) {
            ctx.beginPath();
            ctx.arc(-190 + cr * 12, -13, 0.7, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
        ctx.beginPath();
        ctx.ellipse(-87, 2, 32, 5, 0, 0, Math.PI * 2);
        ctx.fill();
        drawTrainWheel(ctx, -104, -8, 8, wheelAngle + 0.5);
        drawTrainWheel(ctx, -70, -8, 8, wheelAngle - 0.5);

        var tenderGrad = ctx.createLinearGradient(0, -32, 0, -2);
        tenderGrad.addColorStop(0, '#b3813a');
        tenderGrad.addColorStop(1, '#5b3b1c');
        ctx.fillStyle = tenderGrad;
        ctx.strokeStyle = 'rgba(199, 154, 74, 0.65)';
        ctx.lineWidth = 1;
        roundRect(ctx, -116, -30, 58, 28, 3);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#120d08';
        ctx.beginPath();
        ctx.ellipse(-87, -31, 24, 5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#2b1e14';
        [[-102, -32, 3], [-95, -34, 4], [-87, -33, 3], [-80, -35, 3], [-73, -32, 3]].forEach(function (coal) {
            ctx.beginPath();
            ctx.arc(coal[0], coal[1], coal[2], 0, Math.PI * 2);
            ctx.fill();
        });

        ctx.strokeStyle = 'rgba(199, 154, 74, 0.4)';
        ctx.beginPath();
        ctx.moveTo(-114, -20);
        ctx.lineTo(-60, -20);
        ctx.stroke();
        ctx.fillStyle = 'rgba(239, 196, 120, 0.55)';
        for (var tr = 0; tr < 5; tr += 1) {
            ctx.beginPath();
            ctx.arc(-108 + tr * 11, -24, 0.7, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.strokeStyle = 'rgba(199, 154, 74, 0.7)';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(-122, -14);
        ctx.lineTo(-116, -14);
        ctx.moveTo(-58, -14);
        ctx.lineTo(-52, -14);
        ctx.stroke();

        ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
        ctx.beginPath();
        ctx.ellipse(0, 2, 52, 7, 0, 0, Math.PI * 2);
        ctx.fill();

        var smokeCount = state.instruction === 'cruise' ? 5 : 4;
        for (var s = 0; s < smokeCount; s += 1) {
            var puff = ((now / 1500) + s / smokeCount) % 1;
            var puffX = 22 - puff * 22;
            var puffY = -66 - puff * 22;
            var puffRadius = 2 + puff * 7;
            ctx.fillStyle = 'rgba(238, 226, 203, ' + ((1 - puff) * 0.18).toFixed(3) + ')';
            ctx.beginPath();
            ctx.arc(puffX, puffY, puffRadius, 0, Math.PI * 2);
            ctx.fill();
        }

        drawTrainWheel(ctx, -28, -11, 11, wheelAngle);
        drawTrainWheel(ctx, 0, -11, 11, wheelAngle + 0.4);
        drawTrainWheel(ctx, 24, -8, 8, wheelAngle + 0.8);

        ctx.strokeStyle = 'rgba(199, 154, 74, 0.65)';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(-28, -10);
        ctx.lineTo(0, -10);
        ctx.lineTo(24, -10);
        ctx.stroke();

        ctx.fillStyle = '#8a4a28';
        ctx.strokeStyle = 'rgba(199, 154, 74, 0.6)';
        ctx.lineWidth = 1;
        roundRect(ctx, -52, -52, 32, 38, 4);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#241a12';
        roundRect(ctx, -54, -56, 36, 6, 3);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = 'rgba(242, 184, 107, 0.6)';
        roundRect(ctx, -46, -44, 14, 12, 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(199, 154, 74, 0.5)';
        ctx.stroke();

        var boiler = ctx.createLinearGradient(0, -44, 0, -18);
        boiler.addColorStop(0, '#c79a4a');
        boiler.addColorStop(0.45, '#a9742b');
        boiler.addColorStop(1, '#6b451f');
        ctx.fillStyle = boiler;
        ctx.strokeStyle = 'rgba(239, 196, 120, 0.55)';
        roundRect(ctx, -22, -44, 50, 26, 6);
        ctx.fill();
        ctx.stroke();

        ctx.strokeStyle = 'rgba(199, 154, 74, 0.55)';
        ctx.lineWidth = 1;
        [-12, 2, 16].forEach(function (bandX) {
            ctx.beginPath();
            ctx.moveTo(bandX, -44);
            ctx.lineTo(bandX, -18);
            ctx.stroke();
        });

        ctx.fillStyle = 'rgba(199, 154, 74, 0.8)';
        for (var rivet = 0; rivet < 5; rivet += 1) {
            ctx.beginPath();
            ctx.arc(-16 + rivet * 9, -42, 0.8, 0, Math.PI * 2);
            ctx.fill();
        }

        // Handrail along the boiler.
        ctx.strokeStyle = 'rgba(239, 196, 120, 0.55)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(-20, -48);
        ctx.lineTo(28, -48);
        ctx.stroke();
        [-16, -2, 12, 26].forEach(function (postX) {
            ctx.beginPath();
            ctx.moveTo(postX, -48);
            ctx.lineTo(postX, -44);
            ctx.stroke();
        });

        // Cylinder, piston rod and crosshead at the front.
        ctx.fillStyle = '#6b451f';
        ctx.strokeStyle = 'rgba(239, 196, 120, 0.6)';
        roundRect(ctx, 2, -20, 19, 8, 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#2b1e14';
        ctx.beginPath();
        ctx.arc(21, -16, 2.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(199, 154, 74, 0.85)';
        ctx.lineWidth = 1.3;
        ctx.beginPath();
        ctx.moveTo(21, -16);
        ctx.lineTo(25, -11);
        ctx.stroke();

        // Smokebox door and hinge.
        ctx.fillStyle = '#241a12';
        ctx.strokeStyle = 'rgba(199, 154, 74, 0.6)';
        ctx.beginPath();
        ctx.arc(30, -28, 5.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = 'rgba(199, 154, 74, 0.7)';
        ctx.beginPath();
        ctx.arc(30, -28, 1.1, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(30, -33.5);
        ctx.lineTo(30, -31.5);
        ctx.stroke();

        // Bell and sand dome.
        ctx.fillStyle = '#c79a4a';
        ctx.strokeStyle = 'rgba(239, 196, 120, 0.7)';
        ctx.beginPath();
        ctx.arc(11, -50, 2.4, Math.PI, 0);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#8a5a2b';
        ctx.beginPath();
        ctx.arc(-8, -46, 4, Math.PI, 0);
        ctx.fill();
        ctx.stroke();

        // Whistle.
        ctx.fillStyle = '#c79a4a';
        roundRect(ctx, -31, -60, 2.4, 5, 1);
        ctx.fill();
        ctx.strokeStyle = 'rgba(199, 154, 74, 0.6)';
        ctx.lineWidth = 0.7;
        ctx.stroke();

        ctx.fillStyle = '#8a5a2b';
        ctx.strokeStyle = 'rgba(239, 196, 120, 0.6)';
        ctx.beginPath();
        ctx.arc(2, -46, 5, Math.PI, 0);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#2b1e14';
        ctx.strokeStyle = 'rgba(199, 154, 74, 0.65)';
        roundRect(ctx, 18, -66, 8, 22, 2);
        ctx.fill();
        ctx.stroke();
        ctx.beginPath();
        ctx.ellipse(22, -66, 5.5, 2.5, 0, 0, Math.PI * 2);
        ctx.fillStyle = '#120d08';
        ctx.fill();
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(28, -18);
        ctx.lineTo(42, 0);
        ctx.lineTo(28, 0);
        ctx.closePath();
        ctx.fillStyle = '#a9742b';
        ctx.fill();
        ctx.strokeStyle = 'rgba(239, 196, 120, 0.55)';
        ctx.stroke();

        ctx.fillStyle = '#241a12';
        ctx.strokeStyle = 'rgba(199, 154, 74, 0.65)';
        ctx.beginPath();
        ctx.arc(28, -36, 3.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.globalCompositeOperation = 'lighter';
        var beam = ctx.createLinearGradient(30, -36, 112, -36);
        beam.addColorStop(0, 'rgba(255, 236, 196, 0.2)');
        beam.addColorStop(1, 'rgba(255, 236, 196, 0)');
        ctx.fillStyle = beam;
        ctx.beginPath();
        ctx.moveTo(30, -38);
        ctx.lineTo(112, -54);
        ctx.lineTo(112, -18);
        ctx.lineTo(30, -34);
        ctx.closePath();
        ctx.fill();
        ctx.globalCompositeOperation = 'source-over';

        ctx.strokeStyle = 'rgba(199, 154, 74, 0.8)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(-38, -52);
        ctx.lineTo(-36, -58);
        ctx.stroke();
        ctx.fillStyle = '#c79a4a';
        ctx.shadowColor = 'rgba(199, 154, 74, 0.8)';
        ctx.shadowBlur = 6;
        ctx.beginPath();
        ctx.arc(-36, -58, 1.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;

        if (braking) {
            ctx.fillStyle = 'rgba(143, 47, 47, 0.18)';
            ctx.beginPath();
            ctx.arc(-28, -8, 12, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#8f2f2f';
            ctx.fillRect(-32, -3, 7, 4);
        }

        ctx.restore();
    }

    function routeTrainX() {
        var x0 = -0.10 * roadW;
        var xU = 0.14 * roadW;
        var xC = 0.46 * roadW;
        var xCity = 0.76 * roadW;
        var x1 = 1.10 * roadW;
        var t = (performance.now() / 1000 + 4) % 35;
        function ease(f) {
            return f * f * (3 - 2 * f);
        }
        if (t < 4) return x0 + (xU - x0) * ease(t / 4);
        if (t < 7) return xU;
        if (t < 14) return xU + (xC - xU) * ease((t - 7) / 7);
        if (t < 17) return xC;
        if (t < 24) return xC + (xCity - xC) * ease((t - 17) / 7);
        if (t < 29) return xCity;
        if (t < 34) return xCity + (x1 - xCity) * ease((t - 29) / 5);
        return x1;
    }

    function trainGeometry() {
        var scale = clamp(roadW / 1000, 0.50, 0.72);
        var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        var cx = reduced ? roadW * 0.76 : routeTrainX();
        var trackY = roadH * 0.78;
        return {
            scale: scale,
            cx: cx,
            trackY: trackY,
            anchorX: cx - 36 * scale,
            anchorY: trackY - 58 * scale,
            actionX: cx - 26 * scale,
            actionY: trackY - 34 * scale
        };
    }

    function brainGeometry() {
        if (roadW < 420) {
            var bx = roadW - 28;
            var by = 24;
            return {
                cw: 26,
                ch: 26,
                cx: bx,
                cy: by,
                inputX: bx,
                inputY: by + 12,
                routerX: bx,
                routerY: by + 12,
                actionX: bx - 8,
                actionY: by + 22
            };
        }
        var cw = clamp(roadW * 0.36, 150, 190);
        var ch = clamp(roadH * 0.48, 96, 128);
        var cx = roadW - cw - 10;
        var cy = 8;
        return {
            cw: cw,
            ch: ch,
            cx: cx,
            cy: cy,
            inputX: cx + 2,
            inputY: cy + ch * 0.64,
            routerX: cx + cw * 0.56,
            routerY: cy + ch * 0.58,
            actionX: cx + 10,
            actionY: cy + ch - 10
        };
    }

    function brainTarget() {
        var geometry = brainGeometry();
        return { x: geometry.inputX, y: geometry.inputY };
    }

    function quadPoint(path, t) {
        var oneMinus = 1 - t;
        return {
            x: oneMinus * oneMinus * path.x0 + 2 * oneMinus * t * path.cx + t * t * path.x1,
            y: oneMinus * oneMinus * path.y0 + 2 * oneMinus * t * path.cy + t * t * path.y1
        };
    }

    function drawArrowhead(ctx, path, t, color) {
        var point = quadPoint(path, t);
        var previous = quadPoint(path, Math.max(0, t - 0.03));
        var angle = Math.atan2(point.y - previous.y, point.x - previous.x);
        ctx.save();
        ctx.translate(point.x, point.y);
        ctx.rotate(angle);
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(4, 0);
        ctx.lineTo(-3, -2.6);
        ctx.lineTo(-3, 2.6);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
    }

    function forwardPathGeometry() {
        var train = trainGeometry();
        var target = brainTarget();
        return {
            x0: train.anchorX,
            y0: train.anchorY,
            cx: (train.anchorX + target.x) / 2,
            cy: Math.min(train.anchorY, target.y) - 30,
            x1: target.x,
            y1: target.y
        };
    }

    function actionPathGeometry() {
        var g = brainGeometry();
        var train = trainGeometry();
        return {
            x0: g.actionX,
            y0: g.actionY,
            cx: (g.actionX + train.actionX) / 2,
            cy: Math.max(g.actionY, train.actionY) + 45,
            x1: train.actionX,
            y1: train.actionY
        };
    }

    function drawLoopPaths(ctx) {
        var forward = forwardPathGeometry();
        var action = actionPathGeometry();

        ctx.save();
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 7]);

        ctx.strokeStyle = 'rgba(199, 154, 74, 0.22)';
        ctx.lineDashOffset = -state.roadOffset * 0.4;
        ctx.beginPath();
        ctx.moveTo(forward.x0, forward.y0);
        ctx.quadraticCurveTo(forward.cx, forward.cy, forward.x1, forward.y1);
        ctx.stroke();

        ctx.strokeStyle = 'rgba(169, 95, 53, 0.22)';
        ctx.lineDashOffset = state.roadOffset * 0.4;
        ctx.beginPath();
        ctx.moveTo(action.x0, action.y0);
        ctx.quadraticCurveTo(action.cx, action.cy, action.x1, action.y1);
        ctx.stroke();
        ctx.restore();

        drawArrowhead(ctx, forward, 0.84, 'rgba(199, 154, 74, 0.55)');
        drawArrowhead(ctx, action, 0.84, 'rgba(169, 95, 53, 0.65)');

        var forwardMid = quadPoint(forward, 0.30);
        var actionMid = quadPoint(action, 0.45);
        ctx.save();
        ctx.font = '6px "IBM Plex Mono", ui-monospace, monospace';
        ctx.fillStyle = 'rgba(199, 154, 74, 0.6)';
        ctx.fillText('uplink', forwardMid.x, forwardMid.y - 6);
        ctx.fillStyle = 'rgba(169, 95, 53, 0.7)';
        ctx.fillText('decision', actionMid.x, actionMid.y + 10);
        ctx.restore();
    }

    function drawActions(ctx) {
        var now = performance.now();
        var path = actionPathGeometry();
        var train = trainGeometry();

        state.actions.forEach(function (action) {
            var elapsed = now - action.start;
            var t = clamp(elapsed / action.duration, 0, 1);
            var point = quadPoint(path, t);
            var previous = quadPoint(path, Math.max(0, t - 0.06));
            var color = action.miss ? 'rgba(143, 47, 47, 0.95)' : 'rgba(242, 184, 107, 0.95)';

            ctx.save();
            ctx.strokeStyle = color;
            ctx.globalAlpha = 0.35;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(previous.x, previous.y);
            ctx.lineTo(point.x, point.y);
            ctx.stroke();

            ctx.globalAlpha = 1;
            drawGear(ctx, point.x, point.y, 3.4, 6, color, 0.9, now / 250);
            ctx.restore();

            if (t >= 1) {
                var after = elapsed - action.duration;
                var alpha = clamp(1 - after / 320, 0, 1);
                if (alpha > 0) {
                    ctx.save();
                    ctx.globalAlpha = alpha;
                    ctx.strokeStyle = color;
                    ctx.lineWidth = 1.5;
                    ctx.beginPath();
                    ctx.arc(train.actionX, train.actionY, 10 + after * 0.04, 0, Math.PI * 2);
                    ctx.stroke();
                    ctx.restore();
                }
            }
        });
    }

    function drawDrum(ctx, x, y, radius, angle) {
        ctx.fillStyle = 'rgba(42, 31, 21, 0.95)';
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = 'rgba(199, 154, 74, 0.8)';
        ctx.lineWidth = 1.1;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.stroke();

        ctx.strokeStyle = 'rgba(199, 154, 74, 0.4)';
        ctx.lineWidth = 0.7;
        ctx.beginPath();
        ctx.arc(x, y, radius * 0.62, 0, Math.PI * 2);
        ctx.stroke();

        ctx.strokeStyle = 'rgba(239, 196, 120, 0.75)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + Math.cos(angle) * radius * 0.7, y + Math.sin(angle) * radius * 0.7);
        ctx.stroke();

        ctx.fillStyle = '#c79a4a';
        ctx.beginPath();
        ctx.arc(x, y, radius * 0.18, 0, Math.PI * 2);
        ctx.fill();
    }

    function drawBrain(ctx) {
        var g = brainGeometry();
        var cx = g.cx;
        var cy = g.cy;
        var cw = g.cw;
        var ch = g.ch;
        var now = performance.now();
        var pulse = reduceMotion.matches ? 0.5 : 0.5 + 0.5 * Math.sin(now / 350);

        if (roadW < 420) {
            ctx.save();
            var mobileGlow = ctx.createRadialGradient(cx, cy + 12, 0, cx, cy + 12, 18);
            mobileGlow.addColorStop(0, 'rgba(199, 154, 74, 0.22)');
            mobileGlow.addColorStop(1, 'rgba(199, 154, 74, 0)');
            ctx.fillStyle = mobileGlow;
            ctx.beginPath();
            ctx.arc(cx, cy + 12, 18, 0, Math.PI * 2);
            ctx.fill();
            drawGear(ctx, cx, cy + 12, 8, 8, 'rgba(199, 154, 74, 0.55)', 0.8, now / 900);
            ctx.fillStyle = 'rgba(239, 196, 120, 0.8)';
            ctx.font = '5px "IBM Plex Mono", ui-monospace, monospace';
            ctx.textAlign = 'center';
            ctx.fillText('MoE', cx, cy + 28);
            ctx.restore();
            return;
        }

        ctx.save();
        ctx.shadowColor = 'rgba(169, 116, 43, 0.18)';
        ctx.shadowBlur = 16;
        ctx.fillStyle = 'rgba(42, 31, 21, 0.96)';
        ctx.strokeStyle = state.spotlight === 'rtmoe' ? 'rgba(239, 196, 120, 0.85)' : 'rgba(199, 154, 74, 0.55)';
        ctx.lineWidth = 1.2;
        roundRect(ctx, cx, cy, cw, ch, 8);
        ctx.fill();
        ctx.stroke();
        ctx.restore();

        ctx.strokeStyle = 'rgba(199, 154, 74, 0.16)';
        ctx.lineWidth = 1;
        roundRect(ctx, cx + 4, cy + 4, cw - 8, ch - 8, 6);
        ctx.stroke();

        ctx.strokeStyle = 'rgba(239, 196, 120, 0.05)';
        ctx.lineWidth = 1;
        for (var grain = 0; grain < 6; grain += 1) {
            var grainX = cx + 8 + grain * (cw - 16) / 5;
            ctx.beginPath();
            ctx.moveTo(grainX, cy + 10);
            ctx.lineTo(grainX, cy + ch - 10);
            ctx.stroke();
        }

        ctx.fillStyle = 'rgba(199, 154, 74, 0.8)';
        [[cx + 9, cy + 9], [cx + cw - 9, cy + 9], [cx + 9, cy + ch - 9], [cx + cw - 9, cy + ch - 9]].forEach(function (rivet) {
            ctx.beginPath();
            ctx.arc(rivet[0], rivet[1], 1.2, 0, Math.PI * 2);
            ctx.fill();
        });

        ctx.fillStyle = 'rgba(199, 154, 74, 0.14)';
        roundRect(ctx, cx + 14, cy + 8, cw - 28, 16, 3);
        ctx.fill();
        ctx.strokeStyle = 'rgba(199, 154, 74, 0.55)';
        ctx.stroke();
        ctx.fillStyle = 'rgba(239, 196, 120, 0.95)';
        ctx.font = '9px Cinzel, Georgia, serif';
        ctx.textAlign = 'left';
        ctx.fillText('MoE ENGINE', cx + 20, cy + 19);
        ctx.fillStyle = 'rgba(199, 154, 74, 0.8)';
        ctx.font = '6px "IBM Plex Mono", ui-monospace, monospace';
        ctx.textAlign = 'right';
        ctx.fillText('LLM', cx + cw - 20, cy + 19);
        ctx.textAlign = 'left';

        var drumX = cx + 28;
        var drumYs = [cy + ch * 0.36, cy + ch * 0.55, cy + ch * 0.74];
        drumYs.forEach(function (drumY, drumIndex) {
            drawDrum(ctx, drumX, drumY, 7, -0.6 + drumIndex * 0.6);
            ctx.strokeStyle = drumIndex === 1 ? 'rgba(239, 196, 120, 0.55)' : 'rgba(169, 95, 53, 0.45)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(drumX + 7, drumY);
            ctx.bezierCurveTo(drumX + 22, drumY, g.routerX - 24, g.routerY, g.routerX - 13, g.routerY);
            ctx.stroke();
        });
        ctx.fillStyle = 'rgba(199, 154, 74, 0.7)';
        ctx.font = '6px "IBM Plex Mono", ui-monospace, monospace';
        ctx.fillText('transformer ×3', cx + 12, cy + ch * 0.27);

        drawGear(ctx, g.routerX, g.routerY, 13, 10, 'rgba(239, 196, 120, 0.85)', 1.1, now / 1700);
        ctx.fillStyle = 'rgba(42, 31, 21, 0.85)';
        ctx.beginPath();
        ctx.arc(g.routerX, g.routerY, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(199, 154, 74, 0.8)';
        ctx.font = '6px "IBM Plex Mono", ui-monospace, monospace';
        ctx.textAlign = 'center';
        ctx.fillText('router', g.routerX, g.routerY - 20);
        ctx.textAlign = 'left';

        var arcRadius = 36;
        for (var i = 0; i < EXPERTS; i += 1) {
            var angle = (-80 + (160 / 7) * i) * Math.PI / 180;
            var vx = g.routerX + Math.cos(angle) * arcRadius;
            var vy = g.routerY + Math.sin(angle) * arcRadius;
            var resident = state.residents.indexOf(i) !== -1;
            var selected = state.selected.indexOf(i) !== -1;

            ctx.strokeStyle = selected ? 'rgba(255, 246, 224, 0.8)' : (resident ? COLORS[i] : 'rgba(255, 236, 196, 0.1)');
            ctx.globalAlpha = selected ? 0.9 : (resident ? 0.35 : 0.12);
            ctx.lineWidth = selected ? 1.2 : 0.8;
            ctx.beginPath();
            ctx.moveTo(g.routerX + Math.cos(angle) * 13, g.routerY + Math.sin(angle) * 13);
            ctx.lineTo(vx, vy);
            ctx.stroke();
            ctx.globalAlpha = 1;

            drawValve(ctx, vx, vy, 4.2, COLORS[i], resident, selected, pulse);
        }

        ctx.fillStyle = 'rgba(199, 154, 74, 0.7)';
        ctx.font = '6px "IBM Plex Mono", ui-monospace, monospace';
        ctx.textAlign = 'right';
        ctx.fillText('experts', cx + cw - 12, cy + ch - 8);

        ctx.strokeStyle = 'rgba(199, 154, 74, 0.7)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(g.inputX, g.inputY, 4, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = 'rgba(239, 196, 120, 0.95)';
        ctx.beginPath();
        ctx.arc(g.inputX, g.inputY, 1.7, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(199, 154, 74, 0.75)';
        ctx.textAlign = 'left';
        ctx.fillText('tokens', g.inputX + 8, g.inputY - 5);

        ctx.strokeStyle = 'rgba(169, 95, 53, 0.75)';
        ctx.beginPath();
        ctx.arc(g.actionX, g.actionY, 4.2, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = 'rgba(169, 95, 53, 0.95)';
        ctx.beginPath();
        ctx.arc(g.actionX, g.actionY, 1.8, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(199, 154, 74, 0.75)';
        ctx.fillText('action', g.actionX + 8, g.actionY + 4);

        if (state.spotlight === 'rtmoe') {
            ctx.save();
            ctx.strokeStyle = 'rgba(199, 154, 74, 0.55)';
            ctx.lineWidth = 1;
            ctx.setLineDash([3, 4]);
            roundRect(ctx, cx - 6, cy - 6, cw + 12, ch + 12, 11);
            ctx.stroke();
            ctx.restore();
        }
    }

    function drawTokens(ctx) {
        var path = forwardPathGeometry();

        state.tokens.forEach(function (token) {
            var t = clamp((token.age - token.delay) / Math.max(0.001, 1 - token.delay), 0, 1);
            if (t <= 0) return;
            var localPath = {
                x0: token.sx,
                y0: token.sy,
                cx: path.cx,
                cy: path.cy,
                x1: path.x1,
                y1: path.y1
            };
            var point = quadPoint(localPath, t);
            var previous = quadPoint(localPath, Math.max(0, t - 0.08));
            var color = COLORS[token.expert];
            var puffRadius = 2.2 + (1 - t) * 1.1;

            ctx.save();
            ctx.strokeStyle = color;
            ctx.globalAlpha = (1 - t) * 0.25;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(previous.x, previous.y);
            ctx.lineTo(point.x, point.y);
            ctx.stroke();

            ctx.globalAlpha = (1 - t * 0.4) * 0.6;
            ctx.fillStyle = 'rgba(246, 236, 214, 0.9)';
            ctx.shadowColor = 'rgba(255, 236, 196, 0.5)';
            ctx.shadowBlur = 7;
            ctx.beginPath();
            ctx.arc(point.x, point.y, puffRadius * 1.45, 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 0;

            ctx.globalAlpha = (1 - t * 0.4) * 0.35;
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.arc(point.x - 1, point.y - 1, puffRadius * 0.8, 0, Math.PI * 2);
            ctx.fill();

            if (!token.hit) {
                ctx.globalAlpha = 0.8;
                ctx.strokeStyle = 'rgba(143, 47, 47, 0.85)';
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.arc(point.x, point.y, puffRadius * 1.8, 0, Math.PI * 2);
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
        ctx.fillStyle = 'rgba(42, 31, 21, 0.88)';
        ctx.strokeStyle = 'rgba(199, 154, 74, 0.55)';
        roundRect(ctx, 10, 10, 194, 24, 5);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = 'rgba(239, 196, 120, 0.95)';
        ctx.font = '9px "IBM Plex Mono", ui-monospace, monospace';
        ctx.fillText('INSTRUCTION · ' + state.toast.text, 18, 26);
        ctx.restore();
    }

    function drawScene(now) {
        if (!roadW || !roadH) return;
        var ctx = roadCtx;
        var trackY = roadH * 0.78;

        ctx.clearRect(0, 0, roadW, roadH);
        drawBackdrop(ctx, trackY);
        drawTrack(ctx, trackY);
        drawSignals(ctx, trackY);
        drawLoopPaths(ctx);
        drawLocomotive(ctx);
        var forecourtY = drawForecourt(ctx, trackY);
        drawTruck(ctx, roadW * 0.44, forecourtY + 2);
        drawPlatformDetails(ctx, trackY);
        drawRobot(ctx);

        if (state.spotlight === 'autoware') {
            var train = trainGeometry();
            ctx.save();
            ctx.strokeStyle = 'rgba(199, 154, 74, 0.65)';
            ctx.lineWidth = 1;
            ctx.setLineDash([3, 4]);
            roundRect(ctx, train.cx - 58 * train.scale, train.trackY - 72 * train.scale, 104 * train.scale, 80 * train.scale, 10);
            ctx.stroke();
            ctx.restore();
        }

        drawBrain(ctx);
        drawActions(ctx);
        drawTokens(ctx);
        drawToast(ctx, now);

        if (state.flash > 0.02) {
            var vignette = ctx.createRadialGradient(roadW / 2, roadH / 2, Math.min(roadW, roadH) * 0.18, roadW / 2, roadH / 2, Math.max(roadW, roadH) * 0.62);
            vignette.addColorStop(0, 'rgba(143, 47, 47, 0)');
            vignette.addColorStop(1, 'rgba(143, 47, 47, ' + (0.22 * state.flash).toFixed(3) + ')');
            ctx.fillStyle = vignette;
            ctx.fillRect(0, 0, roadW, roadH);
        }
    }

    function renderPaper(key) {
        var paper = PAPERS[key];
        if (!paper || !paperPop) return;
        paperTopic.textContent = paper.topic;
        paperTitle.textContent = paper.title;
        paperMeta.textContent = paper.meta;
        paperDesc.textContent = paper.desc;
        if (paper.href) {
            paperLink.hidden = false;
            paperLink.href = paper.href;
            paperLink.target = paper.href.indexOf('http') === 0 ? '_blank' : '_self';
        } else {
            paperLink.hidden = true;
            paperLink.removeAttribute('href');
        }
    }

    function setPaperSpotlight(key) {
        Object.keys(PAPER_TARGETS).forEach(function (paperKey) {
            var target = root.querySelector(PAPER_TARGETS[paperKey]);
            if (target) target.classList.toggle('is-spotlit', paperKey === key);
        });
        state.spotlight = key;
        drawScene(performance.now());
    }

    function positionPaper(anchor) {
        if (!paperPop) return;
        var cardRect = root.getBoundingClientRect();
        var popWidth = paperPop.offsetWidth || 330;
        var popHeight = paperPop.offsetHeight || 180;
        var maxLeft = Math.max(12, cardRect.width - popWidth - 12);
        var left;
        var top;

        if (anchor && anchor.classList.contains('dd-paper-chip')) {
            var anchorRect = anchor.getBoundingClientRect();
            left = clamp(anchorRect.left - cardRect.left, 12, maxLeft);
            top = anchorRect.bottom - cardRect.top + 8;
            if (top + popHeight > cardRect.height - 12) {
                top = anchorRect.top - cardRect.top - popHeight - 8;
            }
        } else {
            var stage = root.querySelector('.dd-stage-wrap');
            var stageRect = stage ? stage.getBoundingClientRect() : cardRect;
            left = clamp(stageRect.left - cardRect.left + 12, 12, maxLeft);
            top = stageRect.top - cardRect.top + 12;
        }

        top = clamp(top, 12, Math.max(12, cardRect.height - popHeight - 12));

        paperPop.style.left = Math.round(left) + 'px';
        paperPop.style.top = Math.round(top) + 'px';
    }

    function showPaper(key, anchor, pin) {
        if (!paperPop || !PAPERS[key]) return;
        window.clearTimeout(paperHideTimer);
        activePaper = key;
        activeAnchor = anchor;
        pinnedPaper = pin ? key : pinnedPaper;
        renderPaper(key);
        paperPop.hidden = false;
        paperPop.classList.toggle('is-pinned', !!pin);
        positionPaper(anchor);
        setPaperSpotlight(key);
        root.querySelectorAll('[data-paper]').forEach(function (button) {
            button.setAttribute('aria-expanded', button === anchor ? 'true' : 'false');
        });
    }

    function hidePaper(force) {
        if (!paperPop) return;
        window.clearTimeout(paperHideTimer);
        if (pinnedPaper && !force) return;
        paperPop.hidden = true;
        paperPop.classList.remove('is-pinned');
        activePaper = null;
        activeAnchor = null;
        pinnedPaper = null;
        setPaperSpotlight(null);
        root.querySelectorAll('[data-paper]').forEach(function (button) {
            button.setAttribute('aria-expanded', 'false');
        });
    }

    function bindPaperEvents() {
        root.querySelectorAll('[data-paper]').forEach(function (button) {
            var key = button.getAttribute('data-paper');

            button.addEventListener('pointerenter', function (event) {
                if (event.pointerType !== 'mouse') return;
                window.clearTimeout(paperHideTimer);
                if (!pinnedPaper) showPaper(key, button, false);
            });

            button.addEventListener('pointerleave', function (event) {
                if (event.pointerType !== 'mouse') return;
                if (!pinnedPaper) {
                    paperHideTimer = window.setTimeout(function () { hidePaper(false); }, 160);
                }
            });

            button.addEventListener('focus', function () {
                var focusVisible = true;
                try { focusVisible = button.matches(':focus-visible'); } catch (error) { focusVisible = true; }
                if (focusVisible && !pinnedPaper) showPaper(key, button, false);
            });

            button.addEventListener('blur', function () {
                if (!pinnedPaper) {
                    paperHideTimer = window.setTimeout(function () { hidePaper(false); }, 160);
                }
            });

            button.addEventListener('click', function (event) {
                event.stopPropagation();
                if (pinnedPaper === key && !paperPop.hidden) {
                    hidePaper(true);
                } else {
                    showPaper(key, button, true);
                }
            });
        });

        if (paperPop) {
            paperPop.addEventListener('mouseenter', function () {
                window.clearTimeout(paperHideTimer);
            });

            paperPop.addEventListener('mouseleave', function () {
                if (!pinnedPaper) {
                    paperHideTimer = window.setTimeout(function () { hidePaper(false); }, 180);
                }
            });

            paperPop.addEventListener('focusin', function () {
                window.clearTimeout(paperHideTimer);
            });

            paperPop.addEventListener('click', function (event) {
                event.stopPropagation();
            });
        }

        if (paperClose) {
            paperClose.addEventListener('click', function () {
                hidePaper(true);
            });
        }

        document.addEventListener('click', function (event) {
            if (!paperPop || paperPop.hidden) return;
            if (paperPop.contains(event.target)) return;
            if (root.contains(event.target) && event.target.closest('[data-paper]')) return;
            hidePaper(true);
        });

        document.addEventListener('keydown', function (event) {
            if (event.key === 'Escape') hidePaper(true);
        });

        window.addEventListener('resize', function () {
            if (paperPop && !paperPop.hidden && activeAnchor) positionPaper(activeAnchor);
        });
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
        state.carY = trainGeometry().anchorY;
        drawChart();
        drawScene(performance.now());
        if (paperPop && !paperPop.hidden && activeAnchor) {
            positionPaper(activeAnchor);
        }
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
        state.selected = [];
        state.lastUsed = new Array(EXPERTS).fill(-1);
        state.usage = new Array(EXPERTS).fill(0);
        state.latencies = [];
        state.tokens = [];
        state.actions = [];
        state.lastLatency = 0;
        state.lastMisses = 0;
        state.lastBatch = 0;
        state.statusText = '';
        state.roadOffset = 0;
        state.speed = 1;
        state.targetLane = INSTRUCTIONS.cruise.lane;
        state.carY = trainGeometry().anchorY;
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
        hidePaper(true);
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
                state.carY = trainGeometry().anchorY;
                state.tokens.forEach(function (token) {
                    token.age = Math.min(1, token.age + dt / TICK_MS);
                });
                state.tokens = state.tokens.filter(function (token) { return token.age < 1; });
                var actionNow = performance.now();
                state.actions = state.actions.filter(function (action) {
                    return actionNow - action.start < action.duration + 320;
                });
                state.flash *= 0.94;
                var targetSpeed = INSTRUCTIONS[state.instruction].slow
                    ? 0.45
                    : (state.lastLatency > state.deadline ? 0.35 : 1);
                state.speed += (targetSpeed - state.speed) * 0.06;
            } else {
                state.carY = trainGeometry().anchorY;
            }
        }

        drawScene(now);
        rafId = window.requestAnimationFrame(frame);
    }

    buildRack();
    bindEvents();
    bindPaperEvents();
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
        state.carY = trainGeometry().anchorY;
        drawScene(performance.now());
    });
})();
