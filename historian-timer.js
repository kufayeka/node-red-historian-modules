module.exports = function(RED) {
    function HistorianTimerNode(config) {
        RED.nodes.createNode(this, config);
        const node = this;
        const interval = parseInt(config.interval) || 1000;

        let running = false;
        let timer = null;
        let expectedCycleTime = 0;

        function runAtInterval() {
            if (!running) return;
            const now = Date.now();

            // Emit message
            node.send({
                payload: { trigger: true },
                timestamp: expectedCycleTime > 0 ? expectedCycleTime : now
            });

            // Atur timing anti drift
            let adjustedInterval;
            if (expectedCycleTime === 0) {
                expectedCycleTime = now + interval;
                adjustedInterval = interval;
            } else {
                adjustedInterval = interval - (now - expectedCycleTime);
                expectedCycleTime += interval;
            }

            // Clamp minimum delay (jaga2 biar gak minus kalau terlalu telat)
            if (adjustedInterval < 0) adjustedInterval = 0;

            timer = setTimeout(runAtInterval, adjustedInterval);
        }

        // Start timer saat node di-deploy
        node.on('close', function() {
            running = false;
            if (timer) clearTimeout(timer);
            expectedCycleTime = 0;
        });

        node.on('input', function(msg) {
            // Optional: enable/disable via input msg (jika mau)
            if (msg && typeof msg.enable !== "undefined") {
                if (msg.enable && !running) {
                    running = true;
                    expectedCycleTime = 0;
                    runAtInterval();
                } else if (!msg.enable && running) {
                    running = false;
                    if (timer) clearTimeout(timer);
                }
            }
        });

        // Otomatis mulai saat deploy
        running = true;
        expectedCycleTime = 0;
        runAtInterval();
    }
    RED.nodes.registerType("historian-timer", HistorianTimerNode);
};
