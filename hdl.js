/**
 * Created by aborovsky on 08.07.2016.
 */

var util = require('util'),
    smartbus = require('smart-bus');

module.exports = function (RED) {

    /**
     * ====== Hdl-CONTROLLER ================
     * Holds configuration for hdljs host+port,
     * initializes new hdljs connections
     * =======================================
     */
    function HdlControllerNode(config) {
        RED.nodes.createNode(this, config);
        this.name = config.name;
        this.host = config.host;
        config.port = parseInt(config.port);
        this.port = config.port;
        config.subnet = parseInt(config.subnet);
        this.subnet = config.subnet;
        config.devid = parseInt(config.devid);
        this.devid = config.devid;
        this.mode = config.mode;
        this.hdljsconn = null;
        var node = this;
        //node.log("new HdlControllerNode, config: " + util.inspect(config));

        /**
         * Initialize an hdljs socket, calling the handler function
         * when successfully connected, passing it the hdljs connection
         */
        this.initializeHdlConnection = function (handler) {
            if (node.hdljsconn) {
                node.log('already connected to hdljs server at ' + config.host + ':' + config.port + ' in mode[' + config.mode + ']');
                if (handler && (typeof handler === 'function'))
                    handler(node.hdljsconn);
                return node.hdljsconn;
            }
            node.log('connecting to hdljs server at ' + config.host + ':' + config.port + ' in mode[' + config.mode + ']');
            node.hdljsconn = null;
            if (config.mode === 'tunnel/unicast') {
                node.hdljsconn = new smartbus(config.host, config.port, '0.0.0.0', 0);
                node.hdljsconn.Connect(function (err) {
                        if (err)
                            node.warn('cannot connect to hdljs server at ' + config.host + ':' + config.port + ' in mode[' + config.mode + '], cause: ' + util.inspect(err));
                        else
                            node.log('Hdl: successfully connected to ' + config.host + ':' + config.port + ' in mode[' + config.mode + ']');
                        handler(node.hdljsconn);
                    }
                );
            }
            else
                throw 'Unsupported mode[' + config.mode + ']'
            return node.hdljsconn;
        };
        this.on("close", function () {
            node.log('disconnecting from hdljs server at ' + config.host + ':' + config.port + ' in mode[' + config.mode + ']');
            node.hdljsconn && node.hdljsconn.Disconnect && node.hdljsconn.Disconnect();
        });
    }

    RED.nodes.registerType("hdl-controller", HdlControllerNode);

    /**
     * ====== Hdl-OUT =======================
     * Sends outgoing HDL telegrams from
     * messages received via node-red flows
     * =======================================
     */
    function HdlOut(config) {
        RED.nodes.createNode(this, config);
        this.name = config.name;
        this.ctrl = RED.nodes.getNode(config.controller);
        var node = this;
        //node.log('new Hdl-OUT, config: ' + util.inspect(config));
        this.on("input", function (msg) {
            node.log('hdlout.onInput, msg[' + util.inspect(msg) + ']');
            if (!(msg && msg.hasOwnProperty('payload'))) return;
            var payload;
            if (typeof(msg.payload) === "object") {
                payload = msg.payload;
            } else if (typeof(msg.payload) === "string") {
                payload = JSON.parse(msg.payload);
            }
            if (payload == null) {
                node.log('hdlout.onInput: illegal msg.payload!');
                return;
            }
            var action;
            switch (true) {
                case /read/.test(msg.topic):
                    action = 'read';
                    break;
                case /respon/.test(msg.topic):
                    action = 'response';
                    break;
                default:
                    action = 'write';
            }
            this.groupAddrSend(payload.dstgad, payload.value, payload.dpt, action, function (err) {
                if (err) {
                    node.error('groupAddrSend error: ' + util.inspect(err));
                }
            });

        });
        this.on("close", function () {
            node.log('hdlOut.close');
        });

        node.status({fill: "yellow", shape: "dot", text: "inactive"});

        function nodeStatusConnected() {
            node.status({fill: "green", shape: "dot", text: "connected"});
        }

        function nodeStatusDisconnected() {
            node.status({fill: "red", shape: "dot", text: "disconnected"});
        }

        function nodeStatusConnecting() {
            node.status({fill: "green", shape: "ring", text: "connecting"});
        }

        /**
         * send a group write telegram to a group address
         * Initializes new hdljs connection per request
         * dstgad: dest group address '1/2/34'
         * dpt: DataPointType eg. '1' for boolean
         * value: the value to write
         * callback:
         *
         * Usage:
         * groupAddrSend({ host: 'localhost', port: 6720}, '1/2/34', 1, 1, function(err) {
		*   if(err) console.error(err);
		* });
         *
         * Datatypes:
         *
         HDL Function                   Information length      EIS         DPT     Value
         Switch                             1 Bit                   EIS 1       DPT 1    0,1
         Dimming (Position, Control, Value) 1 Bit, 4 Bit, 8 Bit     EIS 2        DPT 3    [0,0]...[1,7]
         Time                               3 Byte                  EIS 3        DPT 10
         Date                               3 Byte                  EIS 4       DPT 11
         Floating point                     2 Byte                  EIS 5        DPT 9    -671088,64 - 670760,96
         8-bit unsigned value               1 Byte                  EIS 6        DPT 5    0...255
         8-bit unsigned value               1 Byte                  DPT 5.001    DPT 5.001    0...100
         Blinds / Roller shutter            1 Bit                   EIS 7        DPT 1    0,1
         Priority                           2 Bit                   EIS 8        DPT 2    [0,0]...[1,1]
         IEEE Floating point                4 Byte                  EIS 9        DPT 14    4-Octet Float Value IEEE 754
         16-bit unsigned value              2 Byte                  EIS 10        DPT 7    0...65535
         16-bit signed value                2 Byte                  DPT 8        DPT 8    -32768...32767
         32-bit unsigned value              4 Byte                  EIS 11        DPT 12    0...4294967295
         32-bit signed value                4 Byte                  DPT 13        DPT 13    -2147483648...2147483647
         Access control                     1 Byte                  EIS 12        DPT 15
         ASCII character                    1 Byte                  EIS 13        DPT 4
         8859_1 character                   1 Byte                  DPT 4.002    DPT 4.002
         8-bit signed value                 1 Byte                  EIS 14        DPT 6    -128...127
         14 character ASCII                 14 Byte                 EIS 15        DPT 16
         14 character 8859_1                14 Byte                 DPT 16.001    DPT 16.001
         Scene                              1 Byte                  DPT 17        DPT 17    0...63
         HVAC                               1 Byte                  DPT 20        DPT 20    0..255
         Unlimited string 8859_1            .                       DPT 24        DPT 24
         List 3-byte value                  3 Byte                  DPT 232        DPT 232    RGB[0,0,0]...[255,255,255]
         *
         */
        this.groupAddrSend = function (dstgad, value, dpt, action, callback) {
            dpt = dpt.toString();
            if (action !== 'write')
                throw 'Unsupported action[' + action + '] inside of groupAddrSend';
            node.log('groupAddrSend action[' + action + '] dstgad:' + dstgad + ', value:' + value + ', dpt:' + dpt);
            switch (dpt) {
                case '1': //Switch
                    value = (value.toString() === 'true' || value.toString() === '1')
                    break;
                case '9': //Floating point
                    value = parseFloat(value);
                    break;
                case '5':    //8-bit unsigned value               1 Byte                  EIS 6         DPT 5    0...255
                case '5.001':    //8-bit unsigned value               1 Byte                  DPT 5.001    DPT 5.001    0...100
                case '6':    //8-bit signed value                 1 Byte                  EIS 14        DPT 6    -128...127
                case '7':    //16-bit unsigned value              2 Byte                  EIS 10        DPT 7    0...65535
                case '8':    //16-bit signed value                2 Byte                  DPT 8         DPT 8    -32768...32767
                case '12':   //32-bit unsigned value              4 Byte                  EIS 11        DPT 12    0...4294967295
                case '13':   //32-bit signed value                4 Byte                  DPT 13        DPT 13    -2147483648...2147483647
                case '17':   //Scene                              1 Byte                  DPT 17        DPT 17    0...63
                case '20':   //HVAC                               1 Byte                  DPT 20        DPT 20    0..255
                    value = parseInt(value);
                    break;
                default:
                    throw 'Unsupported dpt[' + dpt + '] inside groupAddrSend of hdl node'

            }

            if (!this.ctrl)
                node.error('Cannot proceed groupAddrSend, cause no controller-node specified!');
            else
            // init a new one-off connection from the effectively singleton HdlController
            // there seems to be no way to reuse the outgoing conn in adreek/node-hdljs
                this.ctrl.initializeHdlConnection(function (connection) {

                    if (connection.connected)
                        nodeStatusConnected();
                    else
                        nodeStatusDisconnected();
                    connection.removeListener('connecting', nodeStatusConnecting);
                    connection.on('connecting', nodeStatusConnecting);
                    connection.removeListener('connected', nodeStatusConnected);
                    connection.on('connected', nodeStatusConnected);
                    connection.removeListener('disconnected', nodeStatusDisconnected);
                    connection.on('disconnected', nodeStatusDisconnected);

                    try {
                        node.log("sendAPDU: " + util.inspect(value));
                        connection.Action(dstgad.toString(), value, null);
                        callback && callback();
                    }
                    catch (err) {
                        node.error('error calling groupAddrSend: ' + err);
                        callback(err);
                    }
                });
        }
    }

    //
    RED.nodes.registerType("hdl-out", HdlOut);

    /**
     * ====== HDL-IN ========================
     * Handles incoming HDL events, injecting
     * json into node-red flows
     * =======================================
     */
    function HdlIn(config) {
        RED.nodes.createNode(this, config);
        this.name = config.name;
        this.connection = null;
        var node = this;
        //node.log('new HDL-IN, config: ' + util.inspect(config));
        var hdljsController = RED.nodes.getNode(config.controller);
        /* ===== Node-Red events ===== */
        this.on("input", function (msg) {
            if (msg != null) {

            }
        });
        var node = this;
        this.on("close", function () {
            if (node.receiveEvent && node.connection)
                node.connection.removeListener('event', node.receiveEvent);
            if (node.receiveStatus && node.connection)
                node.connection.removeListener('status', node.receiveStatus);
        });

        function nodeStatusConnecting() {
            node.status({fill: "green", shape: "ring", text: "connecting"});
        }

        function nodeStatusConnected() {
            node.status({fill: "green", shape: "dot", text: "connected"});
        }

        function nodeStatusDisconnected() {
            node.status({fill: "red", shape: "dot", text: "disconnected"});
        }

        node.receiveEvent = function (gad, data, datagram) {
            node.log('hdl event gad[' + gad + ']data[' + data.toString('hex') + ']');
            node.send({
                topic: 'hdl:event',
                payload: {
                    'srcphy': datagram.source_address,
                    'dstgad': gad,
                    'dpt': 'no_dpt',
                    'value': data.toString(),
                    'type': 'event'
                }
            });
        };
        node.receiveStatus = function (gad, data, datagram) {
            node.log('hdl status gad[' + gad + ']data[' + data.toString('hex') + ']');
            node.send({
                topic: 'hdl:status',
                payload: {
                    'srcphy': datagram.source_address,
                    'dstgad': gad,
                    'dpt': 'no_dpt',
                    'value': data.toString(),
                    'type': 'status'
                }
            });
        };

//		this.on("error", function(msg) {});

        /* ===== hdljs events ===== */
        // initialize incoming HDL event socket (openGroupSocket)
        // there's only one connection for hdljs-in:
        hdljsController && hdljsController.initializeHdlConnection(function (connection) {
            node.connection = connection;
            node.connection.removeListener('event', node.receiveEvent);
            node.connection.on('event', node.receiveEvent);
            node.connection.removeListener('status', node.receiveStatus);
            node.connection.on('status', node.receiveStatus);

            if (node.connection.connected)
                nodeStatusConnected();
            else
                nodeStatusDisconnected();
            node.connection.removeListener('connecting', nodeStatusConnecting);
            node.connection.on('connecting', nodeStatusConnecting);
            node.connection.removeListener('connected', nodeStatusConnected);
            node.connection.on('connected', nodeStatusConnected);
            node.connection.removeListener('disconnected', nodeStatusDisconnected);
            node.connection.on('disconnected', nodeStatusDisconnected);
        });
    }

    //
    RED.nodes.registerType("hdl-in", HdlIn);
}
