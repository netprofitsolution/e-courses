(function (cjs, an) {

var p; // shortcut to reference prototypes
var lib={};var ss={};var img={};
lib.ssMetadata = [];


// symbols:



// stage content:
(lib.empty_Canvas = function(mode,startPosition,loop) {
	this.initialize(mode,startPosition,loop,{step0:5,step1:7,step2:9,step3:11,step4:13,step5:15,step6:17,step7:19,step8:21,step9:23,step10:25,step11:27,step12:29,step13:31,step14:33,step15:35,step16:37,step17:39,step18:41,step19:43,step20:45,step21:47,step22:49,step23:51,step24:53,step25:55,step26:57,step27:59,step28:61,step29:63,step30:65});

	// timeline functions:
	this.frame_5 = function() {
		this.stop();
	}
	this.frame_7 = function() {
		this.stop();
	}
	this.frame_9 = function() {
		this.stop();
	}
	this.frame_11 = function() {
		this.stop();
	}
	this.frame_13 = function() {
		this.stop();
	}
	this.frame_15 = function() {
		this.stop();
	}
	this.frame_17 = function() {
		this.stop();
	}
	this.frame_19 = function() {
		this.stop();
	}
	this.frame_21 = function() {
		this.stop();
	}
	this.frame_23 = function() {
		this.stop();
	}
	this.frame_25 = function() {
		this.stop();
	}
	this.frame_27 = function() {
		this.stop();
	}
	this.frame_29 = function() {
		this.stop();
	}
	this.frame_31 = function() {
		this.stop();
	}
	this.frame_33 = function() {
		this.stop();
	}
	this.frame_35 = function() {
		this.stop();
	}
	this.frame_37 = function() {
		this.stop();
	}
	this.frame_39 = function() {
		this.stop();
	}
	this.frame_41 = function() {
		this.stop();
	}
	this.frame_43 = function() {
		this.stop();
	}
	this.frame_45 = function() {
		this.stop();
	}
	this.frame_47 = function() {
		this.stop();
	}
	this.frame_49 = function() {
		this.stop();
	}
	this.frame_51 = function() {
		this.stop();
	}
	this.frame_53 = function() {
		this.stop();
	}
	this.frame_55 = function() {
		this.stop();
	}
	this.frame_57 = function() {
		this.stop();
	}
	this.frame_59 = function() {
		this.stop();
	}
	this.frame_61 = function() {
		this.stop();
	}
	this.frame_63 = function() {
		this.stop();
	}
	this.frame_65 = function() {
		this.stop();
	}

	// actions tween:
	this.timeline.addTween(cjs.Tween.get(this).wait(5).call(this.frame_5).wait(2).call(this.frame_7).wait(2).call(this.frame_9).wait(2).call(this.frame_11).wait(2).call(this.frame_13).wait(2).call(this.frame_15).wait(2).call(this.frame_17).wait(2).call(this.frame_19).wait(2).call(this.frame_21).wait(2).call(this.frame_23).wait(2).call(this.frame_25).wait(2).call(this.frame_27).wait(2).call(this.frame_29).wait(2).call(this.frame_31).wait(2).call(this.frame_33).wait(2).call(this.frame_35).wait(2).call(this.frame_37).wait(2).call(this.frame_39).wait(2).call(this.frame_41).wait(2).call(this.frame_43).wait(2).call(this.frame_45).wait(2).call(this.frame_47).wait(2).call(this.frame_49).wait(2).call(this.frame_51).wait(2).call(this.frame_53).wait(2).call(this.frame_55).wait(2).call(this.frame_57).wait(2).call(this.frame_59).wait(2).call(this.frame_61).wait(2).call(this.frame_63).wait(2).call(this.frame_65).wait(5));

}).prototype = p = new cjs.MovieClip();
p.nominalBounds = null;
// library properties:
lib.properties = {
	id: '0093FAF71D1B6B4F96CA08ED0AC1FEF4',
	width: 1070,
	height: 650,
	fps: 31,
	color: "#666666",
	opacity: 1.00,
	manifest: [],
	preloads: []
};



// bootstrap callback support:

(lib.Stage = function(canvas) {
	createjs.Stage.call(this, canvas);
}).prototype = p = new createjs.Stage();

p.setAutoPlay = function(autoPlay) {
	this.tickEnabled = autoPlay;
}
p.play = function() { this.tickEnabled = true; this.getChildAt(0).gotoAndPlay(this.getTimelinePosition()) }
p.stop = function(ms) { if(ms) this.seek(ms); this.tickEnabled = false; }
p.seek = function(ms) { this.tickEnabled = true; this.getChildAt(0).gotoAndStop(lib.properties.fps * ms / 1000); }
p.getDuration = function() { return this.getChildAt(0).totalFrames / lib.properties.fps * 1000; }

p.getTimelinePosition = function() { return this.getChildAt(0).currentFrame / lib.properties.fps * 1000; }

an.bootcompsLoaded = an.bootcompsLoaded || [];
if(!an.bootstrapListeners) {
	an.bootstrapListeners=[];
}

an.bootstrapCallback=function(fnCallback) {
	an.bootstrapListeners.push(fnCallback);
	if(an.bootcompsLoaded.length > 0) {
		for(var i=0; i<an.bootcompsLoaded.length; ++i) {
			fnCallback(an.bootcompsLoaded[i]);
		}
	}
};

an.compositions = an.compositions || {};
an.compositions['0093FAF71D1B6B4F96CA08ED0AC1FEF4'] = {
	getStage: function() { return exportRoot.getStage(); },
	getLibrary: function() { return lib; },
	getSpriteSheet: function() { return ss; },
	getImages: function() { return img; }
};

an.compositionLoaded = function(id) {
	an.bootcompsLoaded.push(id);
	for(var j=0; j<an.bootstrapListeners.length; j++) {
		an.bootstrapListeners[j](id);
	}
}

an.getComposition = function(id) {
	return an.compositions[id];
}



})(createjs = createjs||{}, AdobeAn = AdobeAn||{});
var createjs, AdobeAn;