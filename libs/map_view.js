/**
 * @author Jhonyfer Angarita Moreno - jhangaritamo@unal.edu.co
 */

/**
 * Makes zoom-in in map, increasing the size in 10%. 
 * @function
 * @name zoomInMap
 */
function zoomInMap() {
    viewer.scene.scaleX *= 1.1
    viewer.scene.scaleY *= 1.1
    zoomSteps += 1
}

/**
 * Makes zoom-out in map, decreasing the size in 10%.
 * @function
 * @name zoomOutMap
 */
function zoomOutMap() {
    viewer.scene.scaleX *= (1 / 1.1);
    viewer.scene.scaleY *= (1 / 1.1);
    zoomSteps += -1;
}

/**
 * Scroll the map 1 meter up.
 * @function
 * @name shiftUpMap
 */
function shiftUpMap() {
    viewer.shift(0, -1);
    verticalShiftSteps += -1;
}

/**
 * Scroll the map 1 meter down.
 * @function
 * @name shiftDownMap
 */
function shiftDownMap() {
    viewer.shift(0, 1);
    verticalShiftSteps += 1;
}

/**
 * Scroll the map 1 meter right.
 * @function
 * @name shiftRightMap
 */
function shiftRightMap() {
    viewer.shift(-1, 0);
    horizontalShiftSteps += -1;
}

/**
 * Scroll the map 1 meter left.
 * @function
 * @name shiftLeftMap
 */
function shiftLeftMap() {
    viewer.shift(1, 0);
    horizontalShiftSteps += 1;
}

/**
 * Manages connection to the server and all interactions with ROS.
 * Creates topic publishers and subscribers:
 *  - nav: draws a map in webpage
 *  - cancelTopic: send a cancel command to SDV
 *  - send2locationTopic: send a location and orientation message to SDV
 *  - actualLocationTopic: listens actual location of SDV and show it in the webpage.
 *  - teleop: sends velocity commands to SDV for manual operation.
 * @function
 * @name setMapView
 * @requires jQuery 
 * @requires roslib.js
 * @requires nav2d.js 
 * @requires ros2d.js
 * @requires keyboardteleop.js
 * @requires eventemitter2.min.js
 * @requires easeljs.js
 */
function setMapView() {
    //////////////////////////////////////////////////////////////////////////////
    // ROS Conection

    /**
     * Object that manages the ROS Websocket Server Comunication
     * @function
     */
    var rbServer = new ROSLIB.Ros({
        url: 'ws://' + sdv_ip + ':9090'
    });

    /**
     * Function that is invoked when the ROSBridge connection is successful
     * @function
     */
    // Function that is invoked when the ROSBridge connection is successful
    rbServer.on('connection', function () {
        // Writes a message in the feedback place.
        $("#feedback").text("Conectado al servidor websocket del SDV");
        // CSS style for Emergency Stop Button.
        $("a#emergency_stop_button")
            .css("background-color", "#FF0000")
            .addClass("w3-hover-orange");
        conectionStatus = 1;
    });

    /**
     * Function that is invoked when the ROSBridge connection is incorrect
     * @function
     */
    rbServer.on('error', function (error) {
        // Writes a message in the feedback place.
        $("#feedback").text("Error en la conexión con el servidor websocket del SDV");
        conectionStatus = 2;
        redAlert("#feedback", false);
    });

    /**
     * Function that is invoked when the ROSBridge connection was closed
     */
    rbServer.on('close', function () {
        if (conectionStatus == 1) {
            // Writes a message in the feedback place.
            $("#feedback").text("Conexión cerrada");
        }
    });

    //////////////////////////////////////////////////////////////////////////////
    // ROS Map View

    var w = document.getElementById("map").offsetWidth;

    /** 
     * Object that contains the map, loaded from the SDV. Is placed in the
     * map div (html document)
     * @member {ROS2D.Viewer}
     */
    viewer = new ROS2D.Viewer({
        divID: 'map',
        width: w,
        height: w,
        background: '#ffffff',
        continuous: true
    });

    /**
     * Navigation object, placed in the viewer object. This object draws the 
     * map and the SDV in the actual location.
     * @member {NAV2D.OccupancyGridClientNav}
     */
    var nav = NAV2D.OccupancyGridClientNav({
        ros: rbServer,
        rootObject: viewer.scene,
        viewer: viewer,
        serverName: '/move_base',
        //serverName : '/sdvun3/move_base',
        withOrientation: true,
        // topic (optional) - the map topic to listen to
        //topic : "/sdvun3/map",
    });


    //////////////////////////////////////////////////////////////////////////////
    // Emergency Stop Button

    /**
     * Creates a topic object as roslibjs defines. This topic 
     * allows cancel the last comand sent to the SDV.
     * @member {ROSLIB.Topic}
     */
    var cancelTopic = new ROSLIB.Topic({
        ros: rbServer,
        name: '/move_base/cancel',
        messageType: 'actionlib_msgs/GoalID'
    });

    /**
     * Sends the cancel topic messages and clears the last goal of the SDV.
     * This function have to be invoked when the Emergency Stop Button is 
     * clicked.
     * @function
     * @name pubCancelMessage
     */
    function pubCancelMessage() {
        var msg = new ROSLIB.Message({
            stamp: {
                secs: 0,
                nsecs: 0
            },
            id: ""
        });
        cancelTopic.publish(msg);
    }

    // Bindind the Emergency Stop Button with pubCancelMessage function.
    $("a#emergency_stop_button").click(pubCancelMessage);

    //////////////////////////////////////////////////////////////////////////////
    // Predefined Location Panel

    /**
     * send2locationTopic: it creates a topic object as roslibjs defines. This object
     * sends 'geometry_msgs/PoseStamped' that indicates to the SDV where to go.
     * @member {ROSLIB.Topic}
     */
    var send2locationTopic = new ROSLIB.Topic({
        ros: rbServer,
        name: '/move_base_simple/goal',
        messageType: 'geometry_msgs/PoseStamped'
    });

    /**
     * This object contains the PoseStamped message structure. All the 
     * values are equal to zero. To use this message, it is necesary to set the correct
     * values.
     * @member
     */
    var poseStamped = new ROSLIB.Message({
        header: {
            seq: 0,
            stamp: {
                secs: 0,
                nsecs: 0
            },
            frame_id: 'map'
        },
        pose: {
            position: {
                x: 0.0,
                y: 0.0,
                z: 0.0
            },
            orientation: {
                x: 0.0,
                y: 0.0,
                z: 0.0
            }
        }
    });

    /**
     * pubLocationFromSelectedItem: this function:
     *  - Takes the selected item from "location_selected"
     *  - Configure the values according to the selected item
     *  - Publish the message in send2locationTopic.
     * @function
     * @name pubLocationFromSelectedItem
     */
    function pubLocationFromSelectedItem() {

        // Text from the selected item
        var e = document.getElementById("location_select");
        var selectedItem = e.options[e.selectedIndex].text;

        // Sets the values of position and orientation
        switch (selectedItem) {
            case "Celda Experimental":
                poseStamped.pose.position.x = 0.8
                poseStamped.pose.position.y = 5.8
                poseStamped.pose.orientation.z = 0.0
                poseStamped.pose.orientation.w = 0.1
                break
            case "Celda de Prototipado":
                poseStamped.pose.position.x = 0.7067
                poseStamped.pose.position.y = -2.9218
                poseStamped.pose.orientation.z = 0.69
                poseStamped.pose.orientation.w = 0.715
                break
            case "Celda Industrial":
                poseStamped.pose.position.x = 6.76584243774
                poseStamped.pose.position.y = 3.13956570625
                poseStamped.pose.orientation.z = 1.0
                poseStamped.pose.orientation.w = 0.0
                break
            case "Home":
                poseStamped.pose.position.x = 0
                poseStamped.pose.position.y = 0
                poseStamped.pose.orientation.z = 0.0
                poseStamped.pose.orientation.w = 1.0
                break
            case "Centro de estudio":
                poseStamped.pose.position.x = 2.68
                poseStamped.pose.position.y = 2.99
                poseStamped.pose.orientation.z = 0.0
                poseStamped.pose.orientation.w = 0.999
                break
            default:
        }

        // Publish the message.
        send2locationTopic.publish(poseStamped);
    }

    /*
    Bindind the "pubLocationFromSelectedItem" function with "send_selected_location"
    button.
    */
    $("button#send_selected_location").click(pubLocationFromSelectedItem);

    //////////////////////////////////////////////////////////////////////////////
    // User Defined Location Panel


    /**
     * This function:
     *  - Takes values of inputs
     *  - Verifies if these values are correct
     *  - Sends the message
     * @function
     * @name pubMessageFromInput
     */
    function pubMessageFromInput() {

        // Reading the values
        var x = parseFloat($("input#x_position").val());
        var y = parseFloat($("input#y_position").val());
        var w = parseFloat($("input#w_orientation").val());

        // Checking values
        if (isNaN(x) || isNaN(y) || isNaN(w)) {
            // Alert Animation in the button
            redAlert("button#send_user_defined_location", true);
            // Return if at least one value is NaN
            return;
        }

        // Setting Values
        poseStamped.pose.position.x = x;
        poseStamped.pose.position.y = y;
        poseStamped.pose.orientation.z = 0.0;
        poseStamped.pose.orientation.w = w;

        // Publish the message.
        send2locationTopic.publish(poseStamped);
    }

    /*
    Bindind the "pubMessageFromInput" function with "send_user_defined_location"
    button.
    */
    $("button#send_user_defined_location").click(pubMessageFromInput);

    //////////////////////////////////////////////////////////////////////////////
    // Actual Location Panel

    /**
     * Creates a topic object as roslibjs defines. This object
     * listens to messages from odometry.
     * @member
     */
    var actualLocationTopic = new ROSLIB.Topic({
        ros: rbServer,
        //name : '/odom',
        name: '/scanmatch_odom',
        messageType: 'nav_msgs/Odometry'
    });

    // Subscribes the object for listening to the topic.
    actualLocationTopic.subscribe(function (message) {
        var jsonX = JSON.parse(JSON.stringify(message))
        var x = jsonX["pose"]["pose"]["position"]["x"];
        var y = jsonX["pose"]["pose"]["position"]["y"];
        var z = jsonX["pose"]["pose"]["position"]["z"];
        var w = jsonX["pose"]["pose"]["orientation"]["w"];

        var text = "";
        text += "X: " + x.toFixed(2) + "\n";
        text += "Y: " + y.toFixed(2) + "\n";
        text += "Z: " + z.toFixed(2) + "\n";
        text += "W: " + w.toFixed(2) + "\n";

        $("div#actual_loc").text(text);
    });

    //////////////////////////////////////////////////////////////////////////////
    // Keyboard Teleop

    /**
     * This object captures pressed keys and sends geometry_msgs/Twist. Also,
     * detects pressed buttons, and generate the same events that a pressed key.
     * @member {KEYBOARDTELEOP.Teleop}
     */
    var teleop = new KEYBOARDTELEOP.Teleop({
        ros: rbServer,
        //topic: '/cmd_vel_mux/input/teleop',
        topic: "/mobile_base/commands/velocity",
        buttonUp: document.getElementById("key_up"),
        buttonDown: document.getElementById("key_down"),
        buttonLeft: document.getElementById("key_left"),
        buttonRight: document.getElementById("key_right"),
        linearVelScale: 0.3,
        angularVelScale: 0.5,
    });
    //teleop.scale = 0.5;
    //teleop.linear_vel_scale = 0.3;
    //teleop.angular_vel_scale = 0.5;
    teleop.enable = $("#teleop_enable").is(":checked");

    // Binding event to the checkbox
    $("#teleop_enable").change(function () {
        teleop.enable = $(this).is(":checked");
    });

} // End of setMapView function