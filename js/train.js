let fs = require('fs'), 
    path = require('path'), 
    md5 = require('md5'), 
    _ = require('underscore'),   SVM= require('./stringVectorMapping'),
    Synaptic = require('synaptic'); 


SVM.loadPrototypes('./trainingData/prototypes.json');
let trainingData = JSON.parse(fs.readFileSync('./trainingData/data.json')); 
let catIndex = Object.keys(SVM.getCategories(false)); 

trainingData = _.shuffle(trainingData); 

let INPUT_LENGTH = SVM.getVectorSpaceDimensions(); 
let OUTPUT_LENGTH = catIndex.length; 
let TRAINING_ITERATIONS=200, TRAINING_CYCLES=20;


let toHHMMSS = function (s) {
    var sec_num = parseInt(s, 10); // don't forget the second param
    var hours   = Math.floor(sec_num / 3600);
    var minutes = Math.floor((sec_num - (hours * 3600)) / 60);
    var seconds = sec_num - (hours * 3600) - (minutes * 60);

    if (hours   < 10) {hours   = "0"+hours;}
    if (minutes < 10) {minutes = "0"+minutes;}
    if (seconds < 10) {seconds = "0"+seconds;}
    return hours+':'+minutes+':'+seconds;
}

let hiddenNeurons=INPUT_LENGTH;

let Network = new Synaptic.Architect.Perceptron(INPUT_LENGTH, hiddenNeurons, OUTPUT_LENGTH); 
let Trainer = new Synaptic.Trainer(Network); 

let start=Date.now();
console.log(`MLP initialized with ${INPUT_LENGTH} input neurons, ${hiddenNeurons} hidden neurons, ${OUTPUT_LENGTH} output neurons, ${Network.neurons().length} total`);
console.log("Training started at "+new Date());

let previousError=+Infinity;

for(var i = 0 ; i < TRAINING_CYCLES ; i++) {           
    Trainer.train(trainingData, {
        rate: (iterations,error)=>{
            let rates=[0.1,0.075,0.05,0.025,0.01,0.0075,0.005,0.01,0.005,0.001];
            let index=Math.round(Math.max(iterations/TRAINING_ITERATIONS,i/(TRAINING_CYCLES-10))*(rates.length-1));
            let rate=+Infinity;
            while (rate>error/10 && index<rates.length)
                rate=rates[index++];
            return rate;
        },
        //error:.005,
        iterations: TRAINING_ITERATIONS,
        shuffle: true,
        schedule: {
            every: 10, // repeat this task every 10 iterations
            do: function(data) {
                // custom log
                let offset=data.iterations+i*TRAINING_ITERATIONS;
                let percent=offset/(TRAINING_CYCLES*TRAINING_ITERATIONS);
                let passed=(Date.now()-start)/1000; //seconds
                let fullTime=passed/percent;
                let remaining=fullTime-passed;
                console.log(`S${i+1}E${data.iterations} at rate ${data.rate.toFixed(4)}, ${Math.round(percent*10000)/100}%, ETA=${toHHMMSS(remaining)}s. Error = ${data.error}`);
                if (data.error<0.00001)
                    return true;
                if (data.error/previousError>1.2)
                    {
                        console.warn('Overfitting detected');
                        //return true;
                    }
                previousError=data.error;
            }
        },
        cost: Synaptic.Trainer.cost.CROSS_ENTROPY
    }); 
}

console.log(`Training finished in ${toHHMMSS((Date.now()-start)/1000)}s.`);
fs.writeFileSync('./brain.json',JSON.stringify(Network.toJSON()));
console.log('Network saved');



