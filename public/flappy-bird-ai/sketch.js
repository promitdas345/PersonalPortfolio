var panSpeed = 8;
var gravity = 3;
var player;

var ground;
var pauseBecauseDead;
var birdSprite;
var topPipeSprite;
var bottomPipeSprite;
var backgroundSprite;
var groundSprite;

//-------------------------------------------------------------------------------- neat globals

var nextConnectionNo = 1000;
var population;
var speed = 60;

var superSpeed = 1;
var showBest = false; //true if only show the best of the previous generation
var runBest = false; //true if replaying the best ever game
var humanPlaying = false; //true if the user is playing

var humanPlayer;


var showBrain = false;
var showBestEachGen = false;
var upToGen = 0;
var genPlayerTemp; //player

var showNothing = false;

var randomPipeHeights = [];
var isChristmas = true;
var continueFromSaved = true; // Set to false to train from scratch

function preload() {
  if (isChristmas) {
    birdSprite = loadImage("images/christmasberd.png");
  } else {
    birdSprite = loadImage("images/fatBird.png");
  }
  topPipeSprite = loadImage("images/full pipe top.png");
  bottomPipeSprite = loadImage("images/full pipe bottom.png");
  backgroundSprite = loadImage("images/background.png");
  groundSprite = loadImage("images/groundPiece.png");

}

function setup() {
  window.canvas = createCanvas(windowWidth, windowHeight);
  
  // Create hidden file input for importing AI
  createFileInput(handleFile).attribute('id', 'fileInput').style('display', 'none');

  player = new Player();
  ground = new Ground();

  pauseBecauseDead = false;

  population = new Population(1000);
  
  // Try to load saved AI
  if (continueFromSaved && population.loadBestPlayer()) {
    console.log("Previous AI training loaded!");
    // Seed the population with the best AI
    for (var i = 0; i < population.players.length; i++) {
      population.players[i].brain = population.bestPlayer.brain.clone();
      population.players[i].brain.mutate(population.innovationHistory);
      population.players[i].brain.generateNetwork();
    }
    console.log("Population seeded with best AI + mutations");
  } else {
    console.log("Training from scratch");
  }
  
  humanPlayer = new Player();
}

function handleFile(file) {
  if (file.type === 'application/json') {
    var reader = new FileReader();
    reader.onload = function(e) {
      if (population.importPlayerFromFile(e.target.result)) {
        console.log("File imported successfully! Press 'B' to watch it play.");
      }
    };
    reader.readAsText(file.file);
  } else {
    console.log("Please select a JSON file");
  }
}

function draw() {
  // background(135, 206, 250);
  drawToScreen();
  if (showBestEachGen) { //show the best of each gen
    showBestPlayersForEachGeneration();
  } else if (humanPlaying) { //if the user is controling the ship[
    showHumanPlaying();
  } else if (runBest) { // if replaying the best ever game
    showBestEverPlayer();
  } else { //if just evolving normally
    if (!population.done()) { //if any players are alive then update them
      population.updateAlive();
    } else { //all dead
      //genetic algorithm
      population.naturalSelection();
    }
  }
  writeInfo();
}
//-----------------------------------------------------------------------------------
function showBestPlayersForEachGeneration() {
  if (!genPlayerTemp.dead) { //if current gen player is not dead then update it

    genPlayerTemp.look();
    genPlayerTemp.think();
    genPlayerTemp.update();
    genPlayerTemp.show();
  } else { //if dead move on to the next generation
    upToGen++;
    if (upToGen >= population.genPlayers.length) { //if at the end then return to the start and stop doing it
      upToGen = 0;
      showBestEachGen = false;
    } else { //if not at the end then get the next generation
      genPlayerTemp = population.genPlayers[upToGen].cloneForReplay();
    }
  }
}
//-----------------------------------------------------------------------------------
function showHumanPlaying() {
  if (!humanPlayer.dead) { //if the player isnt dead then move and show the player based on input
    humanPlayer.look();
    humanPlayer.update();
    humanPlayer.show();
  } else { //once done return to ai
    humanPlaying = false;
  }
}
//-----------------------------------------------------------------------------------
function showBestEverPlayer() {
  if (!population.bestPlayer.dead) { //if best player is not dead
    population.bestPlayer.look();
    population.bestPlayer.think();
    population.bestPlayer.update();
    population.bestPlayer.show();
  } else { //once dead
    runBest = false; //stop replaying it
    population.bestPlayer = population.bestPlayer.cloneForReplay(); //reset the best player so it can play again
  }
}
//---------------------------------------------------------------------------------------------------------------------------------------------------------
//draws the display screen
function drawToScreen() {
  if (!showNothing) {
    //pretty stuff
    image(backgroundSprite, 0, 0, canvas.width, canvas.height);
    // showAll();
    // updateAll();
    drawBrain();


  }
}
//-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
function drawBrain() { //show the brain of whatever genome is currently showing
  var startX = 350; //<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<replace
  var startY = 550;
  var w = 300;
  var h = 200;

  if (runBest) {
    population.bestPlayer.brain.drawGenome(startX, startY, w, h);
  } else
  if (humanPlaying) {
    showBrain = false;
  } else if (showBestEachGen) {
    genPlayerTemp.brain.drawGenome(startX, startY, w, h);
  } else {
    population.players[0].brain.drawGenome(startX, startY, w, h);
  }
}
//-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
//writes info about the current player
function writeInfo() {
  // Top left info
  fill(255);
  stroke(0);
  strokeWeight(4);
  textAlign(LEFT);
  textSize(20);
  
  // Current score
  if (showBestEachGen) {
    text("Score: " + genPlayerTemp.score, 10, 30);
    text("Gen: " + (genPlayerTemp.gen + 1), 10, 55);
  } else if (humanPlaying) {
    text("Score: " + humanPlayer.score, 10, 30);
    text("HUMAN PLAYING", 10, 55);
  } else if (runBest) {
    text("Score: " + population.bestPlayer.score, 10, 30);
    text("Gen: " + population.gen, 10, 55);
    text("REPLAYING BEST", 10, 80);
  } else {
    var bestCurrentPlayer = population.getCurrentBest();
    text("Score: " + bestCurrentPlayer.score, 10, 30);
    text("Gen: " + population.gen, 10, 55);
    text("Best Ever: " + population.bestScore, 10, 80);
    text("Global Best: " + population.globalBestScore, 10, 105);
    text("Species: " + population.species.length, 10, 130);
    text("Alive: " + population.players.filter(p => !p.dead).length, 10, 155);
  }
  
  // Controls info - bottom right with better visibility
  fill(255, 255, 0); // Yellow text
  stroke(0);
  strokeWeight(3);
  textSize(13);
  textAlign(RIGHT);
  var y = canvas.height - 15;
  text("E: Export | I: Import | L: Save | D: Delete | R: Toggle Mode", canvas.width - 10, y);
  y -= 18;
  text("B: Replay Best | G: Show Gens | P: Play Manual", canvas.width - 10, y);
  y -= 18;
  text("SPACE: Toggle Best | F: Speed+ | S: Speed- | N: Hide", canvas.width - 10, y);
  y -= 18;
  fill(0, 255, 0);
  text("Speed: " + speed + " FPS", canvas.width - 10, y);
  y -= 18;
  if (continueFromSaved) {
    fill(100, 255, 100);
  } else {
    fill(255, 100, 100);
  }
  text("Mode: " + (continueFromSaved ? "Continue from Saved" : "Train from Scratch"), canvas.width - 10, y);
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}

function keyPressed() {
  switch (key) {
    case ' ':
      //toggle showBest
      if (humanPlaying) {
        humanPlayer.flap();
      } else {
        showBest = !showBest;
      }

      break;
    case 'F': //speed up frame rate
      speed += 30;
      frameRate(speed);
      console.log("Speed increased to: " + speed + " FPS");
      break;
    case 'S': //slow down frame rate
      if (speed > 30) {
        speed -= 30;
        frameRate(speed);
        console.log("Speed decreased to: " + speed + " FPS");
      }
      break;
    case 'B': //run the best
      runBest = !runBest;
      break;
    case 'G': //show generations
      if (population.genPlayers.length > 0) {
        showBestEachGen = !showBestEachGen;
        upToGen = 0;
        genPlayerTemp = population.genPlayers[upToGen].cloneForReplay();
      } else {
        console.log("No generations completed yet!");
      }
      break;
    case 'N': //show absolutely nothing in order to speed up computation
      showNothing = !showNothing;
      break;
    case 'P': //play
      humanPlaying = !humanPlaying;
      humanPlayer = new Player();
      break;
    case 'L': //manually save
      population.saveBestPlayer();
      console.log("AI manually saved!");
      break;
    case 'D': //delete saved data
      localStorage.removeItem('flappyBirdBestAI');
      console.log("Saved AI data deleted!");
      break;
    case 'E': //export to file
      population.exportBestPlayer();
      break;
    case 'I': //import from file
      document.getElementById('fileInput').click();
      break;
    case 'R': //toggle continue from saved
      continueFromSaved = !continueFromSaved;
      console.log("Continue from saved: " + continueFromSaved + " (refresh to apply)");
      break;
  }
  //any of the arrow keys
  switch (keyCode) {

    case RIGHT_ARROW: //right is used to move through the generations

      if (showBestEachGen) { //if showing the best player each generation then move on to the next generation
        upToGen++;
        if (upToGen >= population.genPlayers.length) { //if reached the current generation then exit out of the showing generations mode
          showBestEachGen = false;
        } else {
          genPlayerTemp = population.genPlayers[upToGen].cloneForReplay();
        }
      }
      break;
  }
}
