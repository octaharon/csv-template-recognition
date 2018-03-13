let fs = require('fs'), 
    path = require('path'), 
    md5 = require('md5'), 
    csv = require('fast-csv'), 
    glob = require("glob"),  
    mapFile=require('./mapFile'),
    _ = require('underscore'),  SVM= require('./stringVectorMapping'),
    Synaptic = require('synaptic'); 

let Network=Synaptic.Network.fromJSON(JSON.parse(fs.readFileSync('./brain.json')));


let files = glob.sync("./testData/*.csv");

if (process.argv[2])
{
    files=glob.sync(process.argv[2]);
}




let results={
    tries:0,
    hits:0,
    byCat:{}
}

let testFile=file=>{
    let f=mapFile(file);
    f.then(fileData=>{
        console.log('Testing file '+file);
        let result=SVM.test(Network.activate.bind(Network),fileData,'./trainingData/prototypes.json');
        results.tries+=result.tries;
        results.hits+=result.hits;
        results.byCat=_.mapObject(result.hitRate,(stats,key)=>{
            return _.mapObject(stats,(v,f)=>v+((results.byCat[key])?(results.byCat[key][f]||0):0));
        });
        fs.writeFileSync(file.replace('.csv','.processed.json'),JSON.stringify(fileData));
        console.log(result.categories,`Hit rate: ${result.hits}/${result.tries}, ${Math.round(result.hits/result.tries*10000)/100}%`);
    }).catch(console.error);
    return f;
}

let startTest=()=>{
    if (files.length)
        testFile(files.pop()).then(startTest);
    else
    {
        console.log(`Total recognition rate:  ${results.hits}/${results.tries}, ${Math.round(results.hits/results.tries*10000)/100}%`)
        console.log(_.mapObject(results.byCat,(stats,key)=>Object.assign({},stats,{rate:stats.tries?Math.round(stats.hits/stats.tries*10000)/100:0})));
    }
}

startTest();
