# DynamoDB to MySQL Transfer Tool

This npm package facilitates the seamless transfer of data from DynamoDB tables to a MySQL server. It offers functionality to explore, scan, and efficiently transfer data while maintaining table structure integrity. By running the tool multiple times, your MySQL database's structure will dynamically update through the usage of ALTER TABLE commands, ensuring data consistency.

## Key Features

- Explore, scan, and transfer DynamoDB tables to MySQL.

- Automatic updating of MySQL table structure (ALTER TABLE) during data transfer.

- Ability to specify tables for export, either all tables within a specific region or selected tables.

- Suitable for production environments, enabling execution of complex queries on MySQL (version 8) databases, simplifying processes compared to using PartiQL or multiple scans.

- Utilizes parallel scanning capabilities via the @shelf/dynamodb-parallel-scan package.

- Concurrency settings adjustable through environment variables (refer to documentation for details).

## Installation

To install the package, use npm:

```bash
npm install dynamodb-to-mysql
```

## Usage

After installation, you can use the tool by importing it into your Node.js application:

```javascript
// ESModule
import { dynamodb2MySQL, dynamodb2MySQLAllTables } from 'dynamodb-to-mysql';
```
There are 2 functions; by default, truncate is false. Set true to truncate the MySQL table if it exists.
```javascript
dynamodb2MySQL(table_name, truncate);
dynamodb2MySQLAllTables(truncate);
```

Refer to the documentation for detailed usage instructions and examples.

## Documentation
You need to set environment variables for MySQL. Default Concurrency for Parallel Scan is 10.
```bash
// MacOS or Linux
export MYSQL_HOST=your.mysql.host
export MYSQL_USER=user
export MYSQL_PASSWORD=password
export MYSQL_DATABASE=my_database
export CONCURRENCY=100
```

This package uses the following libraries:
 
 - [@shelf/dynamodb-parallel-scan](https://github.com/shelfio/dynamodb-parallel-scan)
 - [@aws-sdk/client-dynamodb](https://www.npmjs.com/package/@aws-sdk/client-dynamodb)
 - [promise-mysql](https://www.npmjs.com/package/promise-mysql)

**Don't forget to allow access to DynamoDB in IAM**
```json
{
	"Version": "2012-10-17",
	"Statement": [
	{
		"Sid": "VisualEditor0",
		"Effect": "Allow",
		"Action": [
			"dynamodb:DescribeTable",
			"dynamodb:Scan"
		],
		"Resource": "*"
	}]
}
```

See test/test.js for more details

## Contributing

Contributions are welcome! Feel free to fork the project.

## License

This project is licensed under the [GNU General Public License (GPL)](https://www.gnu.org/licenses/gpl-3.0.html).

---

*Note: This tool is not affiliated with or endorsed by AWS, MySQL, or any associated organizations.*