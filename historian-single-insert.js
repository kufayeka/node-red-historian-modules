module.exports = function (RED) {
    function HistorianSingleInsertNode(config) {
        RED.nodes.createNode(this, config);
        const node = this;
        const tsProperty = config.tsProperty || "payload.metadata.last_update";
        const tsPropertyType = config.tsPropertyType || "msg";

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

                const query = `
                    INSERT INTO uns_historian (ts, value, status, uns)
                    VALUES ('${isoTs}', '${String(value)}', '${(metadata.status || "").replace(/'/g, "''")}', '${metadata.uns.replace(/'/g, "''")}')
                `;

                msg.query = query.trim();
                msg.inserted = {
                    ts: isoTs,
                    value: String(value),
                    status: metadata.status || "",
                    uns: metadata.uns
                };
                send(msg);
                done && done();
            } catch (err) {
                node.error("Historian Single Insert failed: " + err.message, msg);
                done && done(err);
            }
        });
    }
    RED.nodes.registerType("historian-single-insert", HistorianSingleInsertNode);
};
