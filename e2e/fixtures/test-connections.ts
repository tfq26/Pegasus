/**
 * Test connection strings and configurations
 * Update these with your actual test database credentials
 */

export const testConnections = {
    mongodb: {
        atlas: {
            nickname: 'Test MongoDB Atlas',
            description: 'MongoDB Atlas test cluster',
            url: 'mongodb+srv://taufeeq26:K4oumQ8VYz9klN9n@toroscluster.2stjj.mongodb.net/?appName=TorosCluster',
            database: '', // Leave empty to discover databases
            collection: '',
        },
        local: {
            nickname: 'Local MongoDB',
            description: 'Local MongoDB instance',
            url: 'mongodb://127.0.0.1:27017',
            database: 'test',
            collection: 'users',
        },
    },
    mysql: {
        local: {
            nickname: 'Local MySQL',
            description: 'Local MySQL test database',
            host: '127.0.0.1',
            port: 3306,
            user: 'root',
            password: '',
            database: 'pegasus',
        },
    },
    kusto: {
        sample: {
            nickname: 'Kusto Samples',
            description: 'Azure Data Explorer sample cluster',
            cluster: 'https://help.kusto.windows.net',
            database: 'Samples',
        },
    },
};

export type TestConnection = typeof testConnections;
