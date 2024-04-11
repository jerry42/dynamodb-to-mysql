import {dynamodb2MySQL, dynamodb2MySQLAllTables} from 'dynamodb-to-mysql'

// For testing only, set your own credentials to the ENV
process.env.MYSQL_HOST = '127.0.0.1'
process.env.MYSQL_USER = 'root'
process.env.MYSQL_PASSWORD = 'password'
process.env.MYSQL_DATABASE = 'my_database'
process.env.MYSQL_CHARSET = 'utf8'
process.env.MYSQL_ENGINE = 'InnoDB'
process.env.CONCURRENCY = 100
process.env.VERBOSE = false

// You need to be authenticated to AWS CLI
process.env.AWS_ACCESS_KEY_ID='AKIAIOSFODNN7EXAMPLE'
process.env.AWS_SECRET_ACCESS_KEY='wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY'
process.env.AWS_DEFAULT_REGION='us-west-2'

// Copy specific table
dynamodb2MySQL('my_dynamodb_table')

// Copy all tables
dynamodb2MySQLAllTables()