module.exports = function(RED) {
    function HistorianTimerNode(config) {
        RED.nodes.createNode(this, config);
        const node = this;
        const interval = parseInt(config.interval) || 1000;
        const startMs = 100; // <<== ms yang kamu mau

        let running = false;
        let timer = null;
        let expectedCycleTime = 0;

        function getFirstDelay(targetMs) {
            const now = Date.now();
            // Ambil detik sekarang, tambahkan offset targetMs, lalu cari jarak ke depan
            const nowMs = now % interval;
            let wait = (interval + targetMs - nowMs) % interval;
            // Kalau pas, jangan delay
            if (wait === 0) wait = interval;
            return wait;
        }

        function runAtInterval() {
            if (!running) return;
            const now = Date.now();

            node.send({
                payload: { trigger: true },
                timestamp: expectedCycleTime > 0 ? expectedCycleTime : now
            });

            let adjustedInterval;
            if (expectedCycleTime === 0) {
                expectedCycleTime = now + interval;
                adjustedInterval = interval;
            } else {
                adjustedInterval = interval - (now - expectedCycleTime);
                expectedCycleTime += interval;
            }
            if (adjustedInterval < 0) adjustedInterval = 0;

            timer = setTimeout(runAtInterval, adjustedInterval);
        }

        node.on('close', function() {
            running = false;
            if (timer) clearTimeout(timer);
            expectedCycleTime = 0;
        });

        node.on('input', function(msg) {
            if (msg && typeof msg.enable !== "undefined") {
                if (msg.enable && !running) {
                    running = true;
                    expectedCycleTime = 0;
                    const firstDelay = getFirstDelay(startMs);
                    setTimeout(() => {
                        expectedCycleTime = Date.now() + interval;
                        runAtInterval();
                    }, firstDelay);
                } else if (!msg.enable && running) {
                    running = false;
                    if (timer) clearTimeout(timer);
                }
            }
        });

        // Otomatis mulai saat deploy
        running = true;
        expectedCycleTime = 0;
        const firstDelay = getFirstDelay(startMs);
        setTimeout(() => {
            expectedCycleTime = Date.now() + interval;
            runAtInterval();
        }, firstDelay);
    }
    RED.nodes.registerType("historian-timer", HistorianTimerNode);
};
