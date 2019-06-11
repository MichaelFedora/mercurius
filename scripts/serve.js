const express = require('express');
const cors = require('cors');

const app = express();

app.use(cors({ origin: '*', methods: 'GET,POST' }));

app.use('/', express.static('./build-prod'));

console.log('Serving on 0.0.0.0:7171!');
app.listen(7171, '0.0.0.0');
