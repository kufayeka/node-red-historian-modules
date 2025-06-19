module.exports = function (RED) {
    function HistorianInsertQueryBuilderNode(config) {
        RED.nodes.createNode(this, config);
        const node = this;
        const batchSize = parseInt(config.batchSize) || 1;
        const tsProperty = config.tsProperty || "payload.metadata.last_update";
        const tsPropertyType = config.tsPropertyType || "msg";
        const overrideBatchTs = !!config.overrideBatchTs;
        const batchInterval = parseInt(config.batchInterval) || 1000; // interval dalam ms

        let buffer = {};
        let lastBatchTimestamp = {}; // per batch_id!

        node.on('input', function (msg, send, done) {
            try {
                const { value, metadata } = msg.payload || {};
                if (
                    typeof value === 'undefined' ||
                    !metadata ||
                    typeof metadata.uns === 'undefined'
                ) {
                    node.warn("Invalid payload! value, metadata.uns harus ada");
                    done && done();
                    return;
                }
                if (!msg.batch_id) {
                    node.warn("msg.batch_id wajib ada untuk grouping batch!");
                    done && done();
                    return;
                }

                // === Ambil Timestamp dari scope yang dipilih ===
                let lastUpdate;
                if (tsProperty) {
                    if (tsPropertyType === "msg") {
                        lastUpdate = RED.util.getMessageProperty(msg, tsProperty);
                    } else if (tsPropertyType === "flow") {
                        lastUpdate = node.context().flow.get(tsProperty);
                    } else if (tsPropertyType === "global") {
                        lastUpdate = node.context().global.get(tsProperty);
                    }
                }
                // Fallback: metadata.last_update
                if (typeof lastUpdate === "undefined") {
                    lastUpdate = metadata.last_update;
                }

                let isoTs = "";
                try {
                    isoTs = new Date(Number(lastUpdate)).toISOString();
                } catch (e) {
                    node.warn("Invalid last_update (epoch): " + lastUpdate);
                    isoTs = "";
                }

                if (!buffer[msg.batch_id]) buffer[msg.batch_id] = [];
                buffer[msg.batch_id].push({
                    ts: isoTs,
                    value: String(value),
                    status: metadata.status || "",
                    uns: metadata.uns
                });

                // === Saat batch penuh ===
                if (buffer[msg.batch_id].length >= batchSize) {
                    let batchTs = null;

                    // --- Manual monotonic batch timestamp ---
                    if (overrideBatchTs) {
                        let prev = lastBatchTimestamp[msg.batch_id];
                        if (!prev) {
                            // Kalau batch pertama: snap ke interval berikutnya dari first msg ts
                            let baseTs = Number(lastUpdate);
                            prev = Math.ceil(baseTs / batchInterval) * batchInterval;
                        } else {
                            // batch selanjutnya: prev + interval
                            prev = prev + batchInterval;
                        }
                        batchTs = new Date(prev).toISOString();
                        lastBatchTimestamp[msg.batch_id] = prev;
                    }

                    const rows = buffer[msg.batch_id].map(row =>
                        `('${batchTs || row.ts}', '${row.value}', '${row.status.replace(/'/g, "''")}', '${row.uns.replace(/'/g, "''")}')`
                    ).join(',');

                    const query = `
                        INSERT INTO uns_historian (ts, value, status, uns)
                        VALUES ${rows};
                    `;

                    msg.query = query.trim();
                    msg.batch = buffer[msg.batch_id];
                    send(msg);

                    // Buffer dan monotonic update
                    delete buffer[msg.batch_id];
                }
                done && done();
            } catch (err) {
                node.error("Historian Insert Builder failed: " + err.message, msg);
                done && done(err);
            }
        });

        node.on('close', function () {
            buffer = {};
            lastBatchTimestamp = {};
        });
    }
    RED.nodes.registerType("historian-batch-insert", HistorianInsertQueryBuilderNode);
};
