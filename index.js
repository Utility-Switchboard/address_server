var http = require("http");
var pg = require("pg");
const axios = require("axios");

var connectionString = {
  user: "usb@backup-server-restore.",
  database: "USBCrm",
  host: "backup-server-restore.postgres.database.azure.com",
  password: "postgres220-",
  port: 5432,
};
var server = http.createServer(async function (req, res) {
  let reqUrl = req.url.split("?", 1);
  console.log(reqUrl[0]);
  const headers = {
    "Access-Control-Allow-Headers": "*",
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "OPTIONS, POST, GET",
    "Access-Control-Max-Age": 2592000, // 30 days
    /** add other headers as per requirement */
  };

  if (req.method == "OPTIONS") {
    res.writeHead(200, headers);
    res.end();
  } else if (req.method == "POST") {
    if (req.url == "/getAddress") {
      var body = [];
      req
        .on("data", (chunk) => {
          body.push(chunk);
        })
        .on("end", async () => {
          body = Buffer.concat(body).toString();
          var postcode = JSON.parse(body);
          console.log(postcode);
          const data = await getAddress(postcode);
          console.log(data);
          res.writeHead(200, headers);
          res.write(JSON.stringify(data), "utf-8");
          res.end();
        });
    } else if (req.url == "/checkAvailability") {
      var body = [];
      req
        .on("data", (chunk) => {
          body.push(chunk);
        })
        .on("end", async () => {
          body = Buffer.concat(body).toString();
          var postcode = JSON.parse(body);
          console.log(postcode);
          const data = await checkAvailability(postcode);
          console.log(data);
          res.writeHead(200, headers);
          res.write(JSON.stringify(data), "utf-8");
          res.end();
        });
    } else if (reqUrl[0] == "/paymentResponse") {
      var body = [];
      req
        .on("data", (chunk) => {
          body.push(chunk);
        })
        .on("end", async () => {
          body = Buffer.concat(body).toString().replace("%0A", ",");
          let resp = JSON.parse(
            '{"' +
              body
                .replace(/"/g, '\\"')
                .replace(/&/g, '","')
                .replace(/=/g, '":"') +
              '"}'
          );
          handleTransaction(resp);
          res.writeHead(200, headers);
          res.end();
        });
    } else if (req.url == "/getMaxService") {
      var body = [];
      req
        .on("data", (chunk) => {
          body.push(chunk);
        })
        .on("end", async () => {
          body = Buffer.concat(body).toString();
          var code = JSON.parse(body);
          console.log(code);
          const data = await getMaxService(code.code);
          console.log(data);
          res.writeHead(200, headers);
          res.write(JSON.stringify(data), "utf-8");
          res.end();
        });
    } else if (req.url == "/getTransactStatus") {
      var body = [];
      req
        .on("data", (chunk) => {
          body.push(chunk);
        })
        .on("end", async () => {
          body = Buffer.concat(body).toString();
          var servNumber = JSON.parse(body);
          console.log(servNumber);
          const data = await getTransactStatus(servNumber.service_number);
          console.log(data);
          res.writeHead(200, headers);
          res.write(JSON.stringify(data), "utf-8");
          res.end();
        });
    }
  }
});
server.listen(6001);

const getAddress = async (postcode) => {
  var pgClient = new pg.Client(connectionString);
  code = postcode.code.replace(" ", "");
  pgClient.connect();
  var query = await pgClient.query(
    `select * from  usb.excluded_codes where code = '${code.substring(
      0,
      3
    )}' or code = '${code.substring(0, 4)}';`
  );
  console.log("the end");
  await pgClient.end();
  console.log(query.rows);

  console.log(query.rows.length);
  if (query.rows.length > 0) {
    console.log("Service not available in the zone.");
    return {
      status: 404,
      resp: false,
      message: "Service not available in the zone.",
    };
  } else {
    response = await checkAvailability(postcode);
    return {
      status: 200,
      resp: true,
      message: response,
    };
  }
};
const getMaxService = async (code) => {
  var pgClient = new pg.Client(connectionString);

  pgClient.connect();
  var query = await pgClient.query(
    `select service_number from usb.payments where id = (select max(id) from usb.payments WHERE service_number like '${code}%');`
  );
  await pgClient.end();
  console.log(query.rows);

  console.log(query.rows.length);
  if (query.rows.length > 0) {
    console.log("Service not available in the zone.");
    return {
      status: 200,
      resp: true,
      message: query.rows,
    };
  } else {
    return {
      status: 400,
      resp: false,
      message: "Something went wrong!",
    };
  }
};
const getTransactStatus = async (servNumber) => {
  var pgClient = new pg.Client(connectionString);

  pgClient.connect();
  var query = await pgClient.query(
    `select payment_status from usb.payments where service_number = '${servNumber}';`
  );
  await pgClient.end();
  console.log(query.rows);

  console.log(query.rows.length);
  if (query.rows.length > 0) {
    return {
      status: 200,
      payment_status: query.rows[0].payment_status,
    };
  } else {
    return {
      status: 400,
      message: "Something went wrong!",
    };
  }
};
const checkAvailability = async (postcode) => {
  var pgClient2 = new pg.Client(connectionString);
  pgClient2.connect();
  let addresses = [];
  const code = postcode.code.substring(1, 2);
  let finalCode = "";

  if (isNaN(parseInt(code))) {
    finalCode = postcode.code.substring(0, 2);
  } else {
    finalCode = postcode.code.substring(0, 1);
  }
  var query = await pgClient2.query(
    `select * from usb.availability_zones where code = '${finalCode}';`
  );

  await pgClient2.end();
  if (query.rows.length > 0) {
    add = await axios.get(
      `https://api.getAddress.io/find/${postcode.code.replace(
        " ",
        ""
      )}?api-key=ZZuFKTpc60CcM1COri9olg30110&expand=true`
    );

    return {
      avai: query.rows,
      addresses: add.data.addresses,
    };
  } else {
    return {
      status: 404,
      message: "Code not found.",
    };
  }
};
const handleTransaction = async (trans) => {
  if (trans.transStatus === "Y") {
    var pgClient2 = new pg.Client(connectionString);
    pgClient2.connect();
    let query = `insert into usb.payments(service_number, payment_ref, payment_status, trans_time, transId) values('${trans.cartId}', '${trans.desc}', 'true', '${trans.transTime}', '${trans.transId}');`;
    let resp = await pgClient2.query(query);
    console.log(resp);
    await pgClient2.end();
  }
};
