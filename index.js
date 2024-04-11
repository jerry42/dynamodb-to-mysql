const { parallelScan } = require("@shelf/dynamodb-parallel-scan"); // https://github.com/shelfio/dynamodb-parallel-scan
const { DynamoDBClient, DescribeTableCommand, ListTablesCommand } = require("@aws-sdk/client-dynamodb");
const ddb_client = new DynamoDBClient({ region: "eu-west-3" });
const mysql = require("promise-mysql");
const verbose = process.env.VERBOSE || false;
const mysqlEngine = process.env.MYSQL_ENGINE || 'InnoDB';
const mysqlCharset = process.env.MYSQL_CHARSET || 'utf8';

const getItems = async (table_name) => {
	const items = await parallelScan(
		{
			TableName: table_name,
		},
		{ concurrency: parseInt(process.env.CONCURRENCY) || 10 }
	);
	return items;
};

const extract_columns = (item) => {
	let columns = [];
	for (let key in item) {
		columns.push(key);
	}
	return columns.reverse();
};

function containsOnlyNumbers(input) {
	var regex = /^\d+$/;
	return regex.test(input);
}

const type_to_sql = (type) => {
	let retour = "";
	switch (typeof type) {
		case "string":
			if (type.trim().length > 0 && containsOnlyNumbers(type)) {
				retour = "integer";
			} else {
				retour = "text";
			}
			break;
		case "number":
			if (containsOnlyNumbers(type)) {
				retour = "integer";
			} else {
				retour = "decimal";
			}
			break;
		case "boolean":
			retour = "boolean";
			break;
		default:
			retour = "text";
	}
	return retour;
};

function getItemsNotPresentInArray(arr1, arr2) {
	return arr1.filter((item) => !arr2.includes(item));
}

function removeEmoji(str) {
	const emojiRegex = /[\u{1F600}-\u{1F64F}|\u{1F300}-\u{1F5FF}|\u{1F680}-\u{1F6FF}|\u{1F700}-\u{1F77F}|\u{1F780}-\u{1F7FF}|\u{1F800}-\u{1F8FF}|\u{1F900}-\u{1F9FF}|\u{1FA00}-\u{1FA6F}|\u{1FA70}-\u{1FAFF}|\u{2600}-\u{26FF}|\u{2700}-\u{27BF}|\u{20D0}-\u{20FF}]+/gu;
	return str.replace(emojiRegex, "");
}

function escapeValues(inputString) {
	return removeEmoji(inputString.replace(/(['"])/g, "\\$1"));
}

function compareFieldDifferencesByName(array1, array2) {
	const differences = [];
	const names2 = new Set(array2.map((field) => field.name));
	for (const field1 of array1) {
		if (!names2.has(field1.name)) {
			differences.push(field1.name);
		}
	}

	return differences;
}

function create_sql_type(field_item) {
	let sql_type;
	switch (field_item.type) {
		case "varchar":
			sql_type = "VARCHAR(" + field_item.length + ")";
			break;
		case "integer":
			sql_type = "INT";
			break;
		case "decimal":
			sql_type = "DECIMAL(" + (parseInt(field_item.length) + 2) + ", 2)";
			break;
		case "boolean":
			sql_type = "BOOLEAN";
			break;
		default:
			sql_type = "TEXT";
	}
	return sql_type;
}

const extract_table_structure = async (table_name) => {
	if (verbose) {
		console.log(`Extracting table structure "${table_name}"...`);
	}
	const mysql_connection = await mysql.createConnection({
		host: process.env.MYSQL_HOST,
		user: process.env.MYSQL_USER,
		password: process.env.MYSQL_PASSWORD,
		database: process.env.MYSQL_DATABASE,
	});

	const DescribeTableInput = {
		TableName: table_name,
	};
	var pk_field = "";
	const describe_table_command = new DescribeTableCommand(DescribeTableInput);
	const table_struct = await ddb_client.send(describe_table_command);
	for (let index = 0; index < table_struct.Table.KeySchema.length; index++) {
		if (table_struct.Table.KeySchema[index].KeyType === "HASH") {
			pk_field = table_struct.Table.KeySchema[index].AttributeName;
		}
	}
	let index_field = [];
	for (let index = 0; index < table_struct.Table.AttributeDefinitions.length; index++) {
		if (table_struct.Table.AttributeDefinitions[index].AttributeName == pk_field) {
			continue;
		}
		index_field.push(table_struct.Table.AttributeDefinitions[index].AttributeName);
	}

	const allItems = await getItems(table_name);
	if (allItems.length == 0) {
		if (verbose) {
			console.log(`Table ${table_name} has no item`);
		}
		return false;
	}
	let base_col = extract_columns(allItems[0]);
	let struct_data = [];
	for (let j = 0; j < base_col.length; j++) {
		let item = {
			name: base_col[j],
			length: allItems[0][base_col[j]].length,
			type: type_to_sql(allItems[0][base_col[j]]),
		};
		if (base_col[j] == pk_field) {
			item.pk = true;
		}
		if (index_field.includes(base_col[j])) {
			item.index = true;
		}
		struct_data.push(item);
	}
	for (let i = 0; i < allItems.length; i++) {
		let columns = extract_columns(allItems[i]);
		let newCol = getItemsNotPresentInArray(columns, base_col);
		if (newCol.length > 0) {
			base_col = base_col.concat(newCol);
			for (let j = 0; j < newCol.length; j++) {
				struct_data.push({
					name: newCol[j],
					length: allItems[i][newCol[j]].toString().length,
					type: type_to_sql(allItems[i][newCol[j]]),
				});
			}
		}
		for (let j = 0; j < struct_data.length; j++) {
			let it = struct_data[j];
			if ((allItems[i][it.name] != undefined && it.length < allItems[i][it.name].toString().length) || it.length == undefined) {
				struct_data[j].length = allItems[i][it.name].toString().length;
			}
			if (allItems[i][it.name] != undefined && type_to_sql(allItems[i][it.name]) !== it.type) {
				if (it.type == "text") {
					continue;
				}
				if (type_to_sql(allItems[i][it.name]) == "decimal" && it.type == "integer") {
					struct_data[j].type = "decimal";
				} else if (type_to_sql(allItems[i][it.name]) == "text" && it.type == "integer") {
					struct_data[j].type = "text";
				}
			}
		}
	}
	for (let j = 0; j < struct_data.length; j++) {
		struct_data[j].length = struct_data[j].length + parseInt(struct_data[j].length / 2);
		if (struct_data[j].length < 250 && struct_data[j].type == "text") {
			struct_data[j].type = "varchar";
		}
		if (verbose) {
			console.log(`Column ${struct_data[j].name} has type ${struct_data[j].type} and length ${struct_data[j].length}`);
		}
	}

	let mysql_field = [];

	let sqlDescribe1 = `SHOW TABLES LIKE '${table_name}'`;
	let resDescribe1 = await mysql_connection.query(sqlDescribe1);
	if (resDescribe1.length == 0) {
		let sql = `CREATE TABLE IF NOT EXISTS ${table_name} (`;
		let sql_type = "";
		let option = "";
		for (let i = 0; i < struct_data.length; i++) {
			option = "";
			sql_type = create_sql_type(struct_data[i]);
			if (struct_data[i].pk == true) {
				option = "PRIMARY KEY";
			} else if (struct_data[i].index == true) {
				option = `, INDEX(${struct_data[i].name})`;
			}
			sql += `\`${struct_data[i].name}\` ${sql_type} ${option}`;
			if (i < struct_data.length - 1) {
				sql += ", ";
			}
		}
		sql += `) ENGINE=${mysqlEngine} DEFAULT CHARSET=${mysqlCharset};`;
		if (verbose) {
			console.log(`Creating table ${table_name} in MySQL : ${sql}`);
		}
		await mysql_connection.query(sql);
	} else {
		let sqlDescribe = `SHOW COLUMNS FROM ${table_name}`;
		let resDescribe = await mysql_connection.query(sqlDescribe);
		for (let i = 0; i < resDescribe.length; i++) {
			let item = {};
			item.name = resDescribe[i].Field;
			item.type = resDescribe[i].Type;
			if (resDescribe[i].Key == "PRI") {
				item.pk = true;
			}
			mysql_field.push(item);
		}
		let diff = compareFieldDifferencesByName(struct_data, mysql_field);
		for (let k = struct_data.length - 1; k >= 0; k--) {
			if (diff.includes(struct_data[k].name)) {
				let sqlAlter = `ALTER TABLE ${table_name} ADD COLUMN \`${struct_data[k].name}\` ${create_sql_type(struct_data[k])}`;
				if (verbose) {
					console.log(`Altering table ${table_name} in MySQL : ${sqlAlter}`);
				}
				await mysql_connection.query(sqlAlter);
			}
		}
	}

	await mysql_connection.end();
};

const copy_data = async (table_name, truncate = false) => {
	const allItems = await getItems(table_name);
	let sql = "";
	const mysql_connection = await mysql.createConnection({
		host: process.env.MYSQL_HOST,
		user: process.env.MYSQL_USER,
		password: process.env.MYSQL_PASSWORD,
		database: process.env.MYSQL_DATABASE,
	});
	if (truncate) {
		if (verbose) {
			console.log(`Truncating table ${table_name} in MySQL`);
		}
		sql = `TRUNCATE TABLE ${table_name};`;
		await mysql_connection.query(sql);
	}
	if (verbose) {
		console.log(`Copying ${allItems.length} items from DynamoDB to MySQL table ${table_name}`);
	}
	for (let i = 0; i < allItems.length; i++) {
		let columns = extract_columns(allItems[i]);
		sql = "";
		sql += `INSERT INTO ${table_name} (`;
		sql += columns.map((it) => `\`${it}\``).join(", ");
		sql += ") VALUES (";
		sql += Object.values(allItems[i])
			.reverse()
			.map((item) => `'${escapeValues(`${item}`)}'`)
			.join(",");
		sql += `) ON DUPLICATE KEY UPDATE \`${columns[0]}\` = \`${columns[0]}\`;`;
		await mysql_connection.query(sql);
	}
	await mysql_connection.end();
};

const check_env_variables = () => {
	if (process.env.MYSQL_HOST == undefined) {
		console.error("Missing MySQL_HOST environment variable");
		process.exit(1);
	}
	
	if (process.env.MYSQL_USER == undefined) {
		console.error("Missing MYSQL_USER environment variable");
		process.exit(1);
	}
	
	if (process.env.MYSQL_PASSWORD == undefined) {
		console.error("Missing MYSQL_PASSWORD environment variable");
		process.exit(1);
	}
	
	if (process.env.MYSQL_DATABASE == undefined) {
		console.error("Missing MYSQL_DATABASE environment variable");
		process.exit(1);
	}
}

exports.dynamodb2MySQL = async (table_name, truncate = false) => {
	check_env_variables()
	await extract_table_structure(table_name);
	await copy_data(table_name, truncate);
};

exports.dynamodb2MySQLAllTables = async (truncate = false) => {
	check_env_variables()
	const command = new ListTablesCommand({});
	const response = await ddb_client.send(command);
	if (verbose && response.TableNames.length == 0) {
		console.log(`No table found in DynamoDB`);
	}
	for (let i = 0; i < response.TableNames.length; i++) {
		let table_name = response.TableNames[i];
		await extract_table_structure(table_name);
		await copy_data(table_name, truncate);
	}
	return false;
};