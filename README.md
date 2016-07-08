node-red-contrib-hdl
==========================
# Description
HDL nodes for node-red.

HDL for node-red, utilizing pure JavaScript HDL Buspro driver (both works: tunelling & routing).
Uses the pure JavaScript implementation of hdl driver for Node.JS (https://github.com/estbeetoo/hdl.js). 

# What's inside?
It will include three nodes:

'hdl-controller' : a unique CONFIG node that holds connection configuration for hdl and will acts as the encapsulator for HDL access. As a node-red 'config' node, it cannot be added to a graph, but it acts as a singleton object that gets created in the the background when you add an 'hdl' or 'hdl-device' node and configure it accordingly.

-- 'hdl-out' : HDL output node that can send HDL to arbitrary GA's and datatypes, so it can be used with function blocks.

-- 'hdl-in': HDL listener node, who emits flow messages based on activity on the HDL bus:

Both use the same message format, an example message follows:

{ "topic": "hdl: write", "payload": { "srcphy": "1.1.100", "dstgad": "5/0/2", "dpt": "DPT1", "value": 0 } }

-- topic is: *"hdl: (telegram type)" where (telegram type) is 'read' (read requests), 'response' (to read requests) and 'write' (to update GA's)

-- payload contains:

--- srcphy: source physical address (the device that sent the HDL telegram) - this information is only emitted by hdl-in, and will be ignored by hdl-out (no address spoofing, you naughty haxx0r!)

--- dstgad: destination group address (the function that this telegram refers to eg. front porch lights) - REQUIRED

--- dpt: datapoint type (1 for booleans, 5 for 4-bit dimming setpoints etc) - defaults to 1 for boolean on/off GA's

--- value: the destination group address's value conveyed in the telegram - REQUIRED

**Right now it not tested in all directions, but tunnelling mode (only write commands) are working.**
**It tested with HDL Buspro router: ABB IPR/S 2.1.**
 
# Usage

According to official documentation: http://nodered.org/docs/getting-started/adding-nodes.html
 
# License

![Attribution-NonCommercial-ShareAlike 4.0 International (CC BY-NC-SA 4.0)](https://licensebuttons.net/l/by-nc-sa/4.0/88x31.png "CC BY-NC-SA 4.0")