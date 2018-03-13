let fs = require('fs'), 
    path = require('path'), 
    md5 = require('md5'), 
    _ = require('underscore'), 
    glob = require("glob"), 
    readline = require('readline'), 
    mapFile=require('./mapFile'),
    csv = require('fast-csv'), 
    SVM= require('./stringVectorMapping');
    


files = glob.sync("./trainingData/*.csv");

let limit=100;

let storage={};
let fields={};

let p=[];
files.slice(0,limit).forEach(tpl=>p.push(mapFile(tpl).catch(console.error))); 
Promise.all(p).then(files=>{
    files.forEach(file=>{
        console.log(`File ${file.filename} read, ${file.lines} lines, ${Object.values(file.fields).length} columns`);
        
        SVM.pushFile(file);
    });

    SVM.embedSpace({
        prototypesFileName:'./trainingData/prototypes.json',
        fieldsFileName:'./trainingData/fields.json',
        preprocessedDataFileName:'./trainingData/preprocessed.json'
    });

    let trainingData = []; 
    /*Object.keys(storage).forEach((category, ix) =>  {
        storage[category].forEach(d =>  {
            trainingData.push( {
                input:d, 
                output:SVM.getCategoryVector(category)
            }); 
        })
    }); */
    trainingData = SVM.getTrainingData();
    lineCount=_.pluck(files,'lines').reduce((s,v)=>s+v,0);
    fs.writeFileSync('./trainingData/data.json', JSON.stringify(trainingData)); 
    console.log(`Training data saved to './trainingData/data.json'`);
    console.log(`Total ${files.length} files, ${lineCount} lines parsed, ${trainingData.length} training samples extracted`);
}).catch(console.error);

