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

        // NODE STATUS EVENTS
        pool.on('connect', client => updateQueueStatus());
        pool.on('remove', client => node.status({ fill: 'yellow', shape: 'ring', text: 'PG connection removed' }));
        pool.on('error', err => {
            node.status({ fill: 'red', shape: 'ring', text: 'PG error' });
            node.error('PG Pool Error: ' + err.message);
        });
        pool.on('end', () => node.status({ fill: 'red', shape: 'ring', text: 'PG pool ended' }));

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

        // Worker: 1x per concurrency slot
        async function worker() {
            while (true) {
                if (queue.length === 0) {
                    running--;
                    updateQueueStatus();
                    break;
                }

                const { msg, send, done } = queue.shift();
                updateQueueStatus();

                try {
                    const res = await pool.query(msg.query, msg.params || []);
                    msg.payload = res.rows;
                    msg.result = res;
                    send(msg);
                    if (done) done();
                } catch (err) {
                    node.status({ fill: 'red', shape: 'ring', text: 'Query error' });
                    node.error(err.message, msg);
                    if (done) done(err);
                }

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

            queue.push({ msg, send, done });
            updateQueueStatus();

            // Start new worker if not already max concurrency
            if (running < maxConcurrency) {
                running++;
                worker();
            }
        });

        node.on('close', (removed, done) => {
            queue = [];
            updateQueueStatus();
            done();
        });
    }

    RED.nodes.registerType("historian-pg-client", HistorianPGClientNode);
};
