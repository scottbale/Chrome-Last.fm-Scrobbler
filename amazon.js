
/*
 * Chrome-Last.fm-Scrobbler amazon.com "new interface" Connector
 *
 * Jacob Tolar --- http://sheckel.net --- jacob[at]sheckel[dot]net
 *
 * Derived from Pandora module by Jordan Perr
 */

/********* Configuration: ***********/

// changes to the DOM in this container will trigger an update.
LFM_WATCHED_CONTAINER = "div.nowPlayingDetail";

// changes to the DOM in this container are due to play/pause
LFM_PLAY_PAUSE = "div.mp3MasterPlay";

// function that returns title of current song
function LFM_TRACK_TITLE() {
  return $(".currentSongDetails .title").text();
}

// function that returns artist of current song
function LFM_TRACK_ARTIST() {
  // substring(3) because format is: 'by Artist'
  return $(".currentSongDetails .title").next().text().substring(3);
}

function LFM_CURRENT_TIME () {
  timeArr = $(".currentSongStatus .timer #currentTime").html().split(":");
  return parseInt(timeArr[0])*60 + parseInt(timeArr[1]);
}

// function that returns duration of current song in seconds
// called at begining of song
function LFM_TRACK_DURATION() {
  durationArr = $(".currentSongStatus .timer").children().filter(":last").html().split(":");
  return parseInt(durationArr[0])*60 + parseInt(durationArr[1]);
}


/********* Connector: ***********/

var module = function() {

  // encapsulate some "private" state
  var state = {
    lastTrack : "",
    lock : 0;
  }

  var parseNewState = function() {
    return {
      title : LFM_TRACK_TITLE(),
      artist : LFM_TRACK_ARTIST(),
      currentTime : LFM_CURRENT_TIME(),
      duration : LFM_TRACK_DURATION(),
      track : title + " " + artist
    }
  }

  // Queue of functions to be executed. Everything is
  // queued up here, to ensure proper ordering of 
  // (possibly asynchronous) operations
  var queue = [];

  var enqueue = function(f) {
    queue.push(f);
  }

  var executeNext = function() {
    // Remove and execute the first function on the queue.
    (queue.shift())();
  }

  var update = function(newState, isResume) {
    console.log("submitting a now playing request. artist: "+newState.artist+", title: "+newState.title+", current time: "+newState.currentTime+", duration: "+newState.duration);
    state.lastTrack = newState.track;
    chrome.extension.sendRequest({type: 'validate', artist: newState.artist, track: newState.title}, function(response) {
      if (response != false) {
	chrome.extension.sendRequest({type: 'nowPlaying', artist: newState.artist, track: newState.title, currentTime:newState.currentTime, duration: newState.duration});
      } else { // on failure send nowPlaying 'unknown song'
	chrome.extension.sendRequest({type: 'nowPlaying', duration: newState.duration});
      }
    });
    state.lock = 0;
  }

  var isReadyToUpdate? = function(newState, isResume) {
    return (state.lock == 0 && newState.track != "" && (isResume || track != state.lastTrack));
  }

  var updateNowOrDelay = function(isResume) {
    var newState = parseNewState();
    if (isReadyToUpdate(newState, isResume)) {
      enqueue(function() {update(newState, isResume);});
      executeNext();
    } else {
      enqueue(function() {updateNowOrDelay(isResume);});
      state.lock = 1;
      setTimeout(executeNext, 5000);
    }
  }

  return {
    updateNowPlaying : function() {
      updateNowOrDelay(false);
    }
    pause : function() {
      this.reset();
    }
    resume : function() {
      updateNowOrDelay(true);
    }
    reset : function() {
      enqueue(function() {chrome.extension.sendRequest({type: "reset"});});
      executeNext();
    }
  }
}();

var LFM_lastTrack = "";
var LFM_isWaiting = 0;

function LFM_updateNowPlaying(){
  // Acquire data from page
  title = LFM_TRACK_TITLE();
  artist = LFM_TRACK_ARTIST();
  currentTime = LFM_CURRENT_TIME ();
  duration = LFM_TRACK_DURATION();
  newTrack = title + " " + artist;
  // Update scrobbler if necessary
  if (newTrack != "" && newTrack != LFM_lastTrack){
    if (duration == 0) {
      // Nasty workaround for delayed duration visiblity with skipped tracks.
      setTimeout(LFM_updateNowPlaying, 5000);
      return 0;
    }
    console.log("submitting a now playing request. artist: "+artist+", title: "+title+", current time: "+currentTime+", duration: "+duration);
    LFM_lastTrack = newTrack;
    chrome.extension.sendRequest({type: 'validate', artist: artist, track: title}, function(response) {
      if (response != false) {
	chrome.extension.sendRequest({type: 'nowPlaying', artist: artist, track: title, currentTime:currentTime, duration: duration});
      } else { // on failure send nowPlaying 'unknown song'
	chrome.extension.sendRequest({type: 'nowPlaying', duration: duration});
      }
    });
  }
  LFM_isWaiting = 0;
}

function updateIfNotWaiting() {
  if(LFM_isWaiting == 0){
    LFM_isWaiting = 1;
    setTimeout(LFM_updateNowPlaying, 10000);
  }
}

// Run at startup
$(function(){
  console.log("Amazon module starting up");

  $(LFM_WATCHED_CONTAINER).live('DOMSubtreeModified', function(e) {
    //console.log("Live watcher called");
    if ($(LFM_WATCHED_CONTAINER).length > 0) {
      updateIfNotWaiting();
      return;
    }
  });

  $("div.mp3Player-MasterControl").click( function(e) {
    console.log("play/pause clicked");
    if ( $("div.mp3MasterPlayGroup").hasClass("paused")) {
      console.log("paused");
      chrome.extension.sendRequest({type: "reset"});
    } else if ( $("div.mp3MasterPlayGroup").hasClass("playing")) {
      console.log("unpaused");
      updateIfNotWaiting();
    }
    return;
  });

  $(window).unload(function() {
    chrome.extension.sendRequest({type: 'reset'});
    return true;
  });
});




