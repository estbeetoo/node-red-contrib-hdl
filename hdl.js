/**
 * Three node-red's nodes implemented here: hdl-out, hdl-in and hdl-controller.
 * hdl-controller handle real connection to HDL bus.
 * hdl-out and hdl-in use connection, managed by hdl-controller.
 * hdl-out receive msg object from flow and send proper commands to HDL bus.
 * hdl-in node listen to all commands from bus and inject them as msg object into the node-red's flow.
 * Created by aborovsky on 08.07.2016.
 * @author aborovsky
 */

var util = require('util'),
  smartbus = require('smart-bus'),
  debug = require('debug')('node-red-contrib-hdl');

module.exports = function(RED) {

  /**
   * ====== HDL-CONTROLLER ================
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
    debug("new HdlControllerNode, config: " + util.inspect(config));

    /**
     * Initialize an hdljs socket, calling the handler function
     * when successfully connected, passing it the hdljs connection
     */
    this.initializeHdlConnection = function(handler) {
      if (node.hdljsconn) {
        debug('already connected to hdljs server at ' + config.host + ':' + config.port + ' in mode[' + config.mode + ']');
        if (handler && (typeof handler === 'function'))
          handler(node.hdljsconn);
        return node.hdljsconn;
      }
      debug('connecting to hdljs server at ' + config.host + ':' + config.port + ' in mode[' + config.mode + ']');
      node.hdljsconn = null;
      if (config.mode === 'tunnel/unicast') {
        node.hdljsconn = new smartbus({
          subnet: node.subnet,
          id: node.devid,
          gateway: node.host,
          port: node.port
        });
        handler(node.hdljsconn);
      }
      else
        throw 'Unsupported mode[' + config.mode + ']'
      return node.hdljsconn;
    };
    this.on("close", function() {
      debug('disconnecting from hdljs server at ' + config.host + ':' + config.port + ' in mode[' + config.mode + ']');
      node.hdljsconn && node.hdljsconn.socket && node.hdljsconn.socket.close && node.hdljsconn.socket.close();
    });
  }

  RED.nodes.registerType("hdl-controller", HdlControllerNode);

  /**
   * ====== HDL-OUT =======================
   * Sends outgoing HDL telegrams from
   * messages received via node-red flows
   * =======================================
   */
  function HdlOut(config) {
    RED.nodes.createNode(this, config);
    this.name = config.name;
    this.ctrl = RED.nodes.getNode(config.controller);
    var node = this;
    debug('new HDL-OUT, config: ' + util.inspect(config));
    this.on("input", function(msg) {
      debug('hdlout.onInput, msg[' + util.inspect(msg) + ']');
      if (!(msg && msg.hasOwnProperty('payload'))) return;
      var payload;
      if (typeof(msg.payload) === "object") {
        payload = msg.payload;
      } else if (typeof(msg.payload) === "string") {
        try {
          payload = JSON.parse(msg.payload);
          if (typeof (payload) === 'number')
            payload = {cmd: msg.payload.toString()};
        } catch (e) {
          payload = {cmd: msg.payload.toString()};
        }
      }
      if (payload == null) {
        debug('hdlout.onInput: illegal msg.payload!');
        return;
      }
      node.hdlBusSend(payload.device || msg.topic, payload.code || payload.command || payload.cmd || payload.toString(), payload.data || payload.params || payload.args);
    });
    this.on("close", function() {
      debug('hdlOut.close');
    });

    /**
     * Send command to the HDL bus. Initializes new bus connection (if needed).
     * @function
     * @param {string} target - Device address with subnet, i.e. '1.3'
     * @param {integer} code - Command code, for example 0x0031 (49 in decimal)
     * @param {Object} data - Device address with subnet, i.e. '1.3'
     * @param {Function} callback - Function called after work done. Function will receive unempty object of type {Error} if exceprtion occures.
     * @callback Function~callback - Function called after work done.
     * @param {Error} err - Callback receive unempty err object, if some exception occur.
     * @throws Exception if unknown code met
     */
    this.hdlBusSend = function(target, code, data, callback) {
      debug('hdlBusSend target[' + target + ']code[' + code + ']data[' + data + ']callback[' + typeof(callback) + ']');
      if (!this.ctrl)
        node.error('Cannot proceed hdlBusSend, cause no controller-node specified!');
      else
        this.ctrl.initializeHdlConnection(function(connection) {
          try {
            debug("send: " + util.inspect({target: target, code: code, data: data}));
            connection.send(target, code, data, function(err) {
              if (err) {
                node.error('HDL bus error on send: ' + util.inspect(err));
                node.status({fill: "red", shape: "dot", text: (err.msg || "Cannot send")});
                callback && callback(err);
              }
              else {
                node.status({});
                callback && callback();
              }
            });
          }
          catch (err) {
            node.error('error calling hdlBusSend: ' + err);
            node.status({fill: "red", shape: "dot", text: (err.msg || "Cannot send")});
            callback && callback(err);
          }
        });
    }
  }

  RED.nodes.registerType("hdl-out", HdlOut);

  /**
   * Handles incoming HDL events, injecting
   * json into node-red flows
   */
  function HdlIn(config) {
    RED.nodes.createNode(this, config);
    this.name = config.name;
    this.connection = null;
    var node = this;
    debug('new HDL-IN, config: ' + util.inspect(config));
    var hdljsController = RED.nodes.getNode(config.controller);
    var node = this;
    this.on("close", function() {
      if (node.receiveCommand && node.connection)
        node.connection.removeListener('command', node.receiveCommand);
      if (node.receiveBroadcast && node.connection)
        node.connection.removeListener('broadcast', node.receiveBroadcast);
    });

    node.receiveCommand = function(command) {
      debug('receiveCommand');
      debug('hdl command received target[' + command.target.subnet + '.' + command.target.id + ']data[' + (Buffer.isBuffer(command.data) ? command.data.toString('hex') : util.inspect(command.data)) + ']sender[' + command.sender + ']');
      node.send({
        topic: command.target.subnet + '.' + command.target.id,
        payload: Buffer.isBuffer(command.data) ? command.data.toString('hex') : util.inspect(command.data),
        sender: command.sender,
        type: 'command'
      });
    };
    node.receiveBroadcast = function(command) {
      debug('receiveBroadcast');
      debug('hdl broadcast received target[' + command.target.subnet + '.' + command.target.id + ']data[' + (Buffer.isBuffer(command.data) ? command.data.toString('hex') : util.inspect(command.data)) + ']sender[' + command.sender + ']');
      node.send({
        topic: command.target.subnet + '.' + command.target.id,
        payload: Buffer.isBuffer(command.data) ? command.data.toString('hex') : util.inspect(command.data),
        sender: command.sender,
        type: 'broadcast'
      });
    };

//		this.on("error", function(msg) {});

    /* ===== hdljs events ===== */
    // initialize incoming HDL event socket (openGroupSocket)
    // there's only one connection for hdljs-in:
    hdljsController && hdljsController.initializeHdlConnection(function(connection) {
      node.connection = connection;
      node.connection.removeListener('command', node.receiveCommand);
      node.connection.on('command', node.receiveCommand);
      node.connection.removeListener('broadcast', node.receiveBroadcast);
      node.connection.on('broadcast', node.receiveBroadcast);
    });
  }

  RED.nodes.registerType("hdl-in", HdlIn);
}
