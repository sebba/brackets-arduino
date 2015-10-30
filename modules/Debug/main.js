/*
 * This file is part of Arduino
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 *
 * Copyright 2015 Arduino Srl (http://www.arduino.org/)
 *
 * authors: arduino.org team - support@arduino.org
 *
 */

/*jslint vars: true, plusplus: true, devel: true, nomen: true, indent: 4,
 maxerr: 50, browser: true */
/*global $, define, brackets */

define(function (require, exports, module) {
    "use strict";

    var CommandManager      = brackets.getModule("command/CommandManager"),
        Commands            = brackets.getModule("command/Commands"),
        Menus               = brackets.getModule("command/Menus"),
        ExtensionUtils      = brackets.getModule("utils/ExtensionUtils"),
        FileUtils           = brackets.getModule("file/FileUtils"),
        FileSystem          = brackets.getModule("filesystem/FileSystem"),
        WorkspaceManager    = brackets.getModule("view/WorkspaceManager"),
        EventDispatcher     = brackets.getModule("utils/EventDispatcher"),
        EditorManager       = brackets.getModule("editor/EditorManager"),
        DocumentManager     = brackets.getModule("document/DocumentManager"),
        AppInit             = brackets.getModule("utils/AppInit"),
        Dialogs             = brackets.getModule("widgets/Dialogs"),
        DefaultDialogs      = brackets.getModule("widgets/DefaultDialogs");


    var debugDomainName     = "org-arduino-ide-domain-debug",
        compilerDomainName  = "org-arduino-ide-domain-compiler",
        debugPanel          = null,
        debugPanelHTML      = null;

    var cmdSetBreakpoint    = "org.arduino.ide.view.debug.setbreakpoint";

    var debugDomain         = null,
        compilerDomain      = null;

    var debugPrefix         = "[arduino ide - debug]";

    var bp = [],
        String,
        bpData,
        editor,
        codeMirror;

    var tmpLine = 0;

    /**
     * [debug description]
     */
    function Debug () {
        String = brackets.arduino.strings;

        FileUtils;
        debugPanelInit();

        debugDomain = brackets.arduino.domains[debugDomainName]
        compilerDomain = brackets.arduino.domains[compilerDomainName];

        CommandManager.register("Set breakpoint", cmdSetBreakpoint, this.setBreakpoint);

        Menus.getContextMenu(Menus.ContextMenuIds.EDITOR_MENU).addMenuDivider();
        Menus.getContextMenu(Menus.ContextMenuIds.EDITOR_MENU).addMenuItem(cmdSetBreakpoint, null);


        //ATTACH EVENT HANDLER
        debugDomain.on('debug_data', debugDataHandler);
        debugDomain.on('debug_err', debugErrorHandler);
        debugDomain.on('close_flag', debugCloseHandler);

        debugDomain.on('debug_data_set_bp', debugSetBpHandler);
        debugDomain.on('debug_data_rem_bp', debugRemBpHandler);
        debugDomain.on('debug_data_show_bp', debugShowBpHandler);
        debugDomain.on('debug_data_next_bp', debugNextBpHandler);
        debugDomain.on('debug_data_show_var', debugShowVarHandler);
        debugDomain.on('debug_data_next_line', debugNextLineHandler);
        debugDomain.on('debug_data_restore', debugRestoreHandler);

        brackets.arduino.dispatcher.on("arduino-event-debug-show",showDebug);
        brackets.arduino.dispatcher.on("arduino-event-debug-hide",hideDebug);
        brackets.arduino.dispatcher.on("arduino-event-debug",this.showHideDebug);

    }

    function compile() {
        var options = {};
        var sketch_dir = DocumentManager.getCurrentDocument().file._parentPath.slice(0,DocumentManager.getCurrentDocument().file._parentPath.length-1);
        options.name = DocumentManager.getCurrentDocument().file._name.split(".")[0];
        options.device = brackets.arduino.options.target.board;

        options.verbosebuild = brackets.arduino.preferences.get("arduino.ide.preferences.verbosebuild");
        options.verboseupload = brackets.arduino.preferences.get("arduino.ide.preferences.verboseupload");
        options.sketchbook   = brackets.arduino.preferences.get("arduino.ide.preferences.sketchbook");
        options.port = brackets.arduino.options.target.port.address;

        brackets.arduino.dispatcher.trigger("arduino-event-console-clear");

        compilerDomain.exec("compile",options, sketch_dir , true);

    }


    /**
     * [openDebugWindow description]
     * @return {[type]} [description]
     */
    Debug.prototype.showHideDebug = function(){
        togglePanel();
    }

    /**
     * [setBreakpoint description]
     */
    Debug.prototype.setBreakpoint = function(){
        editor = EditorManager.getCurrentFullEditor();
        codeMirror = editor._codeMirror;
        //Enable breakpoint selection only if the panel is visible
        if(debugPanel.isVisible()) {
            var line = editor.getCursorPos().line;

            if(bpData) {
                $.each(bpData.list, function (index, item) {
                    if (item.file == DocumentManager.getCurrentDocument().file._path) {
                        //If the selected line isn't yet in the array mark it, unmark otherwise
                        if ($.inArray(line + 1, item.breakpointList) == -1) {
                            item.breakpointList.push(line + 1);
                            item.breakpointList.sort(function (a, b) {
                                return a - b;
                            })

                            codeMirror.addLineClass(line, null, "arduino-breakpoint");
                            debugDomain.exec("set_breakpoint", DocumentManager.getCurrentDocument().file._name, line + 1)
                                .done(function () {
                                    console.log("Breakpoint setted at " + DocumentManager.getCurrentDocument().file._name + " : " + (line + 1));


                                    /*debugDomain.exec("show_breakpoints")
                                        .done(function(){
                                            console.log("List of breakpoints")
                                        })
                                        .fail(function(err)
                                        {
                                            console.log("Error")
                                        })*/

                                })
                                .fail(function (err) {
                                    console.log("Error")
                                })

                        }
                        else {
                            var elementToRemove = line + 1;
                            item.breakpointList = $.grep(item.breakpointList, function (value) {
                                return value != elementToRemove;
                            })

                            debugDomain.exec("deleteBreakpoint", DocumentManager.getCurrentDocument().file._name, elementToRemove)
                                .done(function () {
                                    console.log("Breakpoint deleted at " + DocumentManager.getCurrentDocument().file._name + " : " + elementToRemove);
                                    var breakpoint = codeMirror.removeLineClass(line, null, "arduino-breakpoint");
                                })
                                .fail(function (err) {
                                    console.log("Error")
                                })
                        }
                    }
                })
            }
            else //if is the first bp
            {
                debugDomain.exec("set_breakpoint", DocumentManager.getCurrentDocument().file._name, line+1)
                    .done(function () {
                        console.log("Breakpoint setted at " + DocumentManager.getCurrentDocument().file._name + " : " + line+1);

                        //push()
                        bpData = {}
                        bpData.list = [];
                        bpData.list.push ({"file" : DocumentManager.getCurrentDocument().file._path , "breakpointList" : [line + 1]});
                        var breakpoint = codeMirror.addLineClass(line, null, "arduino-breakpoint");


                        /*debugDomain.exec("show_breakpoints")
                            .done(function(){
                                console.log("List of breakpoints")
                            })
                            .fail(function(err)
                            {
                                console.log("Error")
                            })*/
                    })
                    .fail(function (err) {
                        console.log("Error")
                    })
            }
        }
        else
            var dlg = Dialogs.showModalDialog(DefaultDialogs.DIALOG_ID_INFO, "Debug not active", "Run Debug before proceed");
    }

    var togglePanel = function() {
        if (debugPanel.isVisible()) {
            hideDebug();
        }
        else {
            showDebug();
        }
    };

    var debugDataHandler = function($event, data){
        /*if(data)
        {
            if(data != "(gdb) ") {
                $('#debug_log').html($('#debug_log').html() + "<span style='color: black;'>" + data.replace("(gdb)", "") + "</span>");
            }
            $('#debug_log').scrollTop($('#debug_log')[0].scrollHeight);
        }*/

    };

    var debugErrorHandler = function($event, error){
        if(error){
            //brackets.arduino.dispatcher.trigger("arduino-event-debug-error", debugPrefix + " Error in debugging : " + error.toString());
            /*if(error != "(gdb) ")
                $('#debug_log').html( $('#debug_log').html() + "<span style='color: red;'>" + error.replace("(gdb)","") + "</span><hr>");
            $('#debug_log').scrollTop($('#debug_log')[0].scrollHeight);*/
        }
    }

    var debugCloseHandler = function($event){
        $('#debug_variables_values').html('');
        $('#debug_info_line').html('');
    }



    var debugSetBpHandler = function($event, data){
        var obj = JSON.parse(data);
        debugDomain.exec("show_breakpoints")
            .done(function(){
                console.log("List of breakpoints")
            })
            .fail(function(err)
            {
                console.log("Error")
            })
    }

    var debugRemBpHandler = function($event, data){
        var obj = JSON.parse(data);

        debugDomain.exec("show_breakpoints")
            .done(function(){
                console.log("List of breakpoints")
            })
            .fail(function(err)
            {
                console.log("Error")
            })
    }

    var debugShowBpHandler = function($event, data){
        var obj = JSON.parse(data),
            filename = "";

        $('#debug_info_bp').html("");
        obj.message.breakpoints.forEach(function(element, index, array) {
            filename = element.File.substring(element.File.lastIndexOf((brackets.platform =='win')? '\\' : '/')+1)
            $('#debug_info_bp').html($('#debug_info_bp').html() + "<span style='color: #1618ff; font-weight: bold'>" + filename + ":" + element.Row + "</span><br>" + "<span style='color: #000000;'>" + element.What + "</span><hr>");
        })
    }

    var debugNextBpHandler = function($event, data){
        codeMirror.removeLineClass(tmpLine, "background", "line-selected");
        var obj = JSON.parse(data);

        debugDomain.exec("show_variables")
            .done(function(){
                console.log("Show variables" )
            })
            .fail(function(err)
            {
                console.log("Error")
            })

        tmpLine = obj.message.LineNumber -1;
        codeMirror.addLineClass( obj.message.LineNumber-1, "background", "line-selected");
        $('#debug_info_line').html( "<span style='color: #6666ff;'>" + "Breakpoint# " + obj.message.BreakpointNumber + "<br>" + "Row : " + obj.message.LineNumber + "<br>" + "Code : " + obj.message.Code + "</span>");
    }

    var debugShowVarHandler = function($event, data){
        var obj = JSON.parse(data);
        $('#debug_variables_values').html("");

        obj.message.variables.forEach(function(element, index, array) {
            $('#debug_variables_values').html($('#debug_variables_values').html() + "<span style='color: #000099;'>" + element + "</span><br>");

            if(index == array.length-1) {
                $('#debug_variables_values').html($('#debug_variables_values').html() + "<span style='color: #000099;'></span>");
            }
        })
    }

    var debugNextLineHandler = function($event, data){
        var obj = JSON.parse(data);

        debugDomain.exec("show_variables")
            .done(function(){
                console.log("Show variables" )
            })
            .fail(function(err)
            {
                console.log("Error")
            })

        if(obj.message.LineNumber != null) {
            codeMirror.removeLineClass(tmpLine, "background", "line-selected");
            tmpLine = obj.message.LineNumber - 1;
            codeMirror.addLineClass(obj.message.LineNumber - 1, "background", "line-selected");
            /*if(obj.message.BreakpointNumber)
             $('#debug_log').html($('#debug_log').html() + "<span style='color: mediumblue;'>" + "Line#" + obj.message.LineNumber + " - Code : " + obj.message.Code + " - Code : " + obj.message.Code + "</span><hr>");
             else*/
            $('#debug_info_line').html("<span style='color: #3232ff;'>" + "Line #" + obj.message.LineNumber + "<br>" + "Code : " + obj.message.Code + "</span>");
            $('#debug_info_line').scrollTop($('#debug_info_line')[0].scrollHeight);
        }
        else
        {
            debugDomain.exec("step_next_line")
                .done(function(){
                    console.log("Continue execution (next line)")
                })
                .fail(function(err)
                {
                    console.log("Error")
                })
        }
    }

    var debugRestoreHandler = function($event, data){
        codeMirror.removeLineClass(tmpLine, "background", "line-selected");
        var obj = JSON.parse(data);

    }



    var sketchUploaded = function($event, directory){
        startDebug(DocumentManager.getCurrentDocument().file._name.replace('.ino',''), directory);
    }

    var showDebug = function(){
        $('#toolbar-debug-btn').removeClass('debughover');

        if (!debugPanel.isVisible()) {
            debugPanel.show();

            compilerDomain.on("uploaded", sketchUploaded);

            $('#toolbar-debug-btn').addClass('debughover');
            compile()
        }
    }

    var hideDebug = function(){
        $('#toolbar-debug-btn').removeClass('debughover');

        if (debugPanel.isVisible()){
            debugPanel.hide();

            $('.arduino-breakpoint').each( function(){
                $(this).removeClass('arduino-breakpoint');
            });

            //Unbind handler from uploaded event
            compilerDomain._eventHandlers.uploaded.pop();

            debugDomain.exec("stopAll")
                .done(function () {
                    console.log("Debug Stopped...")
                    $('#debug_buttons > a' ).each( function(){
                        $(this).attr('disabled',true);
                        $(this).unbind('click')
                        //$('div').removeClass('line-selected');
                    });

                    $('div').removeClass('line-selected');
                })
                .fail(function(err)
                {
                    console.log("Error in debug stop")
                })
        }
    }


    function bindButtonsEvents() {

        /*
        debugPanel.$panel.find("#haltsketchDebug_button").on("click",function(){
            debugDomain.exec("halt")
                .done(function(){
                    console.log("Halt execution")
                })
                .fail(function(err)
                {
                    console.log("Error in halt execution")
                })
        });

        debugPanel.$panel.find("#restoresketchDebug_button").on("click",function(){
            debugDomain.exec("restore")
                .done(function(){
                    console.log("Restore execution")
                })
                .fail(function(err)
                {
                    console.log("Error in restore execution")
                })
        });

        debugPanel.$panel.find("#continuesketchDebug_button").on("click",function(){
            debugDomain.exec("step_next_bp")
                .done(function(){
                    console.log("Continue execution (next bp)")
                })
                .fail(function(err)
                {
                    console.log("Error")
                })
        });

        debugPanel.$panel.find("#stepsketchDebug_button").on("click",function(){
            debugDomain.exec("step_next_line")
                .done(function(){
                    console.log("Continue execution (next line)")
                })
                .fail(function(err)
                {
                    console.log("Error")
                })
        });

        debugPanel.$panel.find("#showbreakpointDebug_button").on("click",function(){
            debugDomain.exec("show_breakpoints")
                .done(function(){
                    console.log("List of breakpoints")
                })
                .fail(function(err)
                {
                    console.log("Error")
                })
        });

        debugPanel.$panel.find("#setbreakpointDebug_button").on("click",function(){
            var currentFileName = DocumentManager.getCurrentDocument().file.name.replace('.ino','.cpp');
            for ( var i = 0 ; i < bp.length ; i++ ) {
                var cur_bp = bp[i];
                debugDomain.exec("set_breakpoint", currentFileName, cur_bp)
                    .done(function () {
                        console.log("Breakpoint setted at " + currentFileName + " : " + cur_bp);
                    })
                    .fail(function (err) {
                        console.log("Error")
                    })
            }
        });

        debugPanel.$panel.find("#showvalueDebug_button").on("click",function(){
            debugDomain.exec("show_variables")
                .done(function(){
                    console.log("Show variables" )
                })
                .fail(function(err)
                {
                    console.log("Error")
                })
        });

        */


        debugPanel.$panel.find("#debug_button_next_bp").on("click",function(){
            debugDomain.exec("step_next_bp")
                .done(function(){
                    console.log("Continue execution (next bp)")
                })
                .fail(function(err)
                {
                    console.log("Error")
                })
        });

        debugPanel.$panel.find("#debug_button_next_line").on("click",function(){
            debugDomain.exec("step_next_line")
                .done(function(){
                    console.log("Continue execution (next line)")
                })
                .fail(function(err)
                {
                    console.log("Error")
                })
        });

        debugPanel.$panel.find("#debug_button_restore").on("click",function(){
            debugDomain.exec("restore")
                .done(function(){
                    console.log("Restore execution")
                })
                .fail(function(err)
                {
                    console.log("Error in restore execution")
                })
        });

    }

    function debugPanelInit(){
        ExtensionUtils.loadStyleSheet(module, "css/Debug.css");

        debugPanelHTML = require("text!modules/Debug/html/Debug.html");
        debugPanel = WorkspaceManager.createBottomPanel("modules/Debug/html/debug.panel", $(debugPanelHTML));
    }

    function startDebug(filename, outdir) {
        debugDomain.exec("launchOpenOcd")
            .done(function (pid) {
                if (pid > 1) {
                    console.log("OpenOcd running...");
                    var elfFile  = outdir + ((brackets.platform =='win')? '\\' : '/') + filename + '.cpp.elf';

                    debugDomain.exec("launchGdb", FileSystem.getFileForPath(FileUtils.convertWindowsPathToUnixPath(elfFile))._path, outdir)
                        .done(function () {
                            console.log("Gdb running...")
                            CommandManager.execute(Commands.CMD_ADD_TO_WORKINGSET_AND_OPEN, {
                                fullPath: FileSystem.getFileForPath(FileUtils.convertWindowsPathToUnixPath(elfFile.replace('.elf','')))._path,
                                paneId: "first-pane"
                            });
                            $('#debug_buttons > a').each(function () {
                                $(this).attr('disabled', false);
                            });

                            bindButtonsEvents();

                            //TODO enable all element in the panel
                            $("#debug_variables_values").html("<span style='color: #00b100; font-weight: bold; font-size: large;'>Debug session started!</span>")

                        })
                        .fail(function (err) {
                            console.log("Error in gdb launch")
                        })
                }
            })
    }

    return Debug;
});