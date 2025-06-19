const fs = require('fs');
const path = require('path');

module.exports = function(RED) {
    function HistorianPGClientNode(config) {
        RED.nodes.createNode(this, config);

        const node = this;
        const pgConfig = RED.nodes.getNode(config.pgConfig);

        if (!pgConfig) {
            node.status({ fill: 'red', shape: 'ring', text: 'Missing PG config' });
            node.error("Missing PG config");
            return;
        }

        const pool = pgConfig.getClient();
        const enableQueue = !!config.enableQueue;
        const enablePersistence = !!config.enablePersistence;
        const enableRetryOnFail = !!config.enableRetryOnFail;
        const retryCount = parseInt(config.retryCount) || 0; // 0 = infinite
        const queueBackoffOrder = Math.max(0, parseInt(config.queueBackoffOrder) || 0);
        const persistInterval = parseInt(config.persistInterval) || 30;
        const nodeId = node.id;
        const fileName = path.join(__dirname, `${nodeId}_query_history.txt`);

        let persistBuffer = [];
        let persistTimer = null;

        // QUEUE LOGIC
        let queue = [];
        let running = 0;
        const maxConcurrency = parseInt(config.concurrency || '1');
        const executionDelay = parseInt(config.delayMs, 10) || 0;

        function updateQueueStatus() {
            let color = 'green';
            let text = 'idle';
            if (running > 0) {
                color = 'blue';
                text = `Running: ${running} Q:${queue.length}`;
            } else if (queue.length > 0) {
                color = 'yellow';
                text = `Waiting Q:${queue.length}`;
            }
            node.status({ fill: color, shape: 'dot', text });
        }

        function delay(ms) {
            return new Promise(resolve => setTimeout(resolve, ms));
        }

        // Persist logic
        function flushPersistBuffer() {
            if (!enablePersistence || persistBuffer.length === 0) return;
            const data = persistBuffer.map(q => `[${new Date().toISOString()}] ${q.query}\n`).join('');
            fs.appendFile(fileName, data, err => {
                if (err) node.warn('Failed to persist query: ' + err.message);
            });
            persistBuffer = [];
        }

        // Start persist timer
        if (enablePersistence) {
            persistTimer = setInterval(flushPersistBuffer, persistInterval * 1000);
        }

        async function processQuery({ msg, send, done, retry = 0 }) {
            if (enablePersistence) {
                persistBuffer.push({ query: msg.query });
            }
            try {
                const res = await pool.query(msg.query, msg.params || []);
                msg.payload = res.rows;
                msg.result = res;
                send(msg);
                if (done) done();
            } catch (err) {
                node.status({ fill: 'red', shape: 'ring', text: 'Query error' });
                node.error(err.message, msg);
                // Retry logic
                if (enableQueue && enableRetryOnFail && (retryCount === 0 || retry < retryCount)) {
                    // Requeue to specified backoff order
                    const job = { msg, send, done, retry: retry + 1 };
                    let idx = Math.min(queueBackoffOrder, queue.length);
                    queue.splice(idx, 0, job);
                } else {
                    if (done) done(err);
                }
            }
        }

        // Worker: 1x per concurrency slot
        async function worker() {
            while (true) {
                if (queue.length === 0) {
                    running--;
                    updateQueueStatus();
                    break;
                }
                const job = queue.shift();
                updateQueueStatus();

                await processQuery(job);

                // Delay after each job (if set)
                if (executionDelay > 0) await delay(executionDelay);
            }
        }

        node.on('input', function(msg, send, done) {
            if (pool._ended) {
                node.status({ fill: 'red', shape: 'ring', text: 'PG pool closed!' });
                node.error('PG pool has ended. Please re-deploy or re-connect.', msg);
                if (done) done(new Error('PG pool ended'));
                return;
            }
            if (!msg.query || typeof msg.query !== 'string') {
                node.status({ fill: 'yellow', shape: 'ring', text: 'No query!' });
                node.warn("msg.query is required!");
                if (done) done();
                return;
            }

            // If queue enabled, always enqueue (and allow retry on error)
            if (enableQueue) {
                queue.push({ msg, send, done, retry: 0 });
                updateQueueStatus();
                if (running < maxConcurrency) {
                    running++;
                    worker();
                }
            } else {
                // Queue not enabled, direct exec, persist always if enabled
                processQuery({ msg, send, done });
            }
        });

        node.on('close', (removed, done) => {
            queue = [];
            flushPersistBuffer();
            if (persistTimer) clearInterval(persistTimer);
            updateQueueStatus();
            done();
        });
    }

    RED.nodes.registerType("historian-pg-client", HistorianPGClientNode);
};
