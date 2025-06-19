// pg-pool-manager.js
const { Pool } = require('pg');

const poolMap = new Map();

function getConnection(id, options) {
    if (!id) throw new Error('ID for pool is required!');
    if (!options) throw new Error('Options for pool is required!');

    if (!poolMap.has(id)) {
        console.log(`[PG-Pool-Manager] Creating new pool for "${id}"`);

        const pool = new Pool({
            ...options,
        });

        pool._ended = false;
        pool.on('end', () => pool._ended = true);

        pool.on('connect', client => {
            console.log(`[PG-Pool-Manager] [${id}] Client connected`);
        });

        // pool.on('remove', client => {
        //     console.log(`[PG-Pool-Manager] [${id}] Client removed`);
        // });

        pool.on('error', (err, client) => {
            console.error(`[PG-Pool-Manager] [${id}] Idle client error:`, err.message);
        });

        poolMap.set(id, pool);
        console.log(`[PG-Pool-Manager] Pool stored. Total pools: ${poolMap.size}`);
    } else {
        console.log(`[PG-Pool-Manager] Reusing existing pool for "${id}"`);
    }

    return poolMap.get(id);
}

async function closeConnection(id) {
    if (!id) throw new Error('ID for pool is required!');
    if (poolMap.has(id)) {
        try {
            await poolMap.get(id).end();
        } catch (err) {
            console.error(`[PG-Pool-Manager] Error closing pool [${id}]:`, err.message);
        }
        poolMap.delete(id);
        console.log(`[PG-Pool-Manager] Pool [${id}] closed. Pools left: ${poolMap.size}`);
    }
}

async function closeAll() {
    for (const id of poolMap.keys()) {
        await closeConnection(id);
    }
}

function getAllConnectionIds() {
    return Array.from(poolMap.keys());
}

function getConnectionStatus(id) {
    if (!poolMap.has(id)) return 'not_found';
    const pool = poolMap.get(id);
    return {
        total: pool.totalCount,   // semua client termasuk idle & in-use
        idle: pool.idleCount,     // idle/siap pakai
        waiting: pool.waitingCount // queue nunggu connection
    };
}


module.exports = {
    getConnection,
    closeConnection,
    closeAll,
    getAllConnectionIds,
    getConnectionStatus
};
