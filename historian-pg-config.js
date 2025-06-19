module.exports = function(RED) {
    const poolMgr = require('./postgres/postgres-pool-manager.js'); // pastikan path-nya bener

    function HistorianPGConfigNode(config) {
        RED.nodes.createNode(this, config);

        this.name     = config.name;
        this.host     = config.host;
        this.port     = parseInt(config.port, 10) || 5432;
        this.user     = config.user;
        this.database = config.database;
        this.min                     = config.min || 0;
        this.max                     = config.max || 10;
        this.idleTimeoutMillis       = config.idleTimeoutMillis || 30000;
        this.connectionTimeoutMillis = config.connectionTimeoutMillis || 10000;
        this.password = this.credentials.password || undefined;
        this.poolId   = this.id;

        this.options = {
            host:     this.host,
            port:     this.port,
            user:     this.user,
            password: this.password,
            database: this.database,
            min: this.min,
            max: this.max,
            idleTimeoutMillis: this.idleTimeoutMillis,
            connectionTimeoutMillis: this.idleTimeoutMillis,
        };

        this.getClient = () => poolMgr.getConnection(this.poolId, this.options);
        this.closeClient = () => poolMgr.closeConnection(this.poolId);

        // Pool cleanup kalau node dihapus
        this.on('close', (removed, done) => {
            this.closeClient().then(r => {
                done();
            });
        });
    }

    RED.nodes.registerType('historian-pg-config', HistorianPGConfigNode, {
        credentials: {
            password: { type: "password" }
        }
    });
};
