module.exports = function(RED) {
    function HistorianBatchIdNode(config) {
        RED.nodes.createNode(this, config);
        const node = this;
        node.batch_id = config.batch_id || "";

        node.on('input', function(msg) {
            // Prioritas: msg.batch_id → msg.payload.batch_id → JSON.stringify(msg.payload) → Date.now() → config.batch_id
            if (!msg.batch_id || msg.batch_id === "") {
                if (msg.payload && msg.payload.batch_id) {
                    msg.batch_id = msg.payload.batch_id;
                } else if (msg.payload && Object.keys(msg.payload).length > 0) {
                    // Use hash/stringify of payload as batch_id
                    try {
                        msg.batch_id = JSON.stringify(msg.payload);
                    } catch (e) {
                        msg.batch_id = String(Date.now());
                    }
                } else if (node.batch_id && node.batch_id !== "") {
                    msg.batch_id = node.batch_id;
                } else {
                    msg.batch_id = String(Date.now());
                }
            }
            node.send(msg);
        });
    }
    RED.nodes.registerType("historian-batch-id", HistorianBatchIdNode);
}
