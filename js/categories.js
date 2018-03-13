let _ = require('underscore'), fs=require('fs');

let Categories =  JSON.parse(fs.readFileSync('./categories.json'));
if (!_.isObject(Categories))
    throw new Error("Can't read the Categories file"); 

let Mapping =  JSON.parse(fs.readFileSync('./mapping.json'));
if (!_.isObject(Mapping))
    throw new Error("Can't read the Mapping file");

const emptyWord="";

let extraFrequencyKeys=[
    'REST', //non-mapped symbols frequency,
    'LENGTH_X', //proportional length (compared to the longest row value)
    'LENGTH_Y', //proportional length (compared to the longest column value)
    'FRACTION_X', //prevalence of the value in a ROW
    'FRACTION_Y', //prevalence of the value in a COLUMN
    'ENTROPY_X', // proportion of information contained in a cell compared to row, symbol-wise
    'ENTROPY_Y', // proportion of information contained in a cell compared to column, symbol-wise
    'ENTROPY_ROW', // proportion of information contained in a cell compared to row, value-wise
    'ENTROPY_COLUMN',// proportion of information contained in a cell compared to column, value-wise
    'DIVERGENCE', //symbol distribution Bhattacharyya coefficient against even distribution
    'LOCALITY' //symbol average position distribution distance to evenly distributed
];
let Frequencies = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 ?!$%*()/-+[].,;:'".split("").concat(extraFrequencyKeys); 

/**
 *  Calculate the person correlation score between two items in a dataset.
 *
 *  @param  {object}  prefs The dataset containing data about both items that
 *                    are being compared.
 *  @param  {string}  p1 Item one for comparison.
 *  @param  {string}  p2 Item two for comparison.
 *  @return {float}  The pearson correlation score.
 */
function pearsonCorrelation(prefs, p1=0, p2=1) {
    var si = [];
  
    for (var key in prefs[p1]) {
      if (prefs[p2][key]) si.push(key);
    }

    var n = si.length;
  
    if (n == 0) return 0;
  
    var sum1 = 0;
    for (var i = 0; i < si.length; i++) sum1 += prefs[p1][si[i]];
  
    var sum2 = 0;
    for (var i = 0; i < si.length; i++) sum2 += prefs[p2][si[i]];


  
    var sum1Sq = 0;
    for (var i = 0; i < si.length; i++) {
      sum1Sq += Math.pow(prefs[p1][si[i]], 2);
    }
  
    var sum2Sq = 0;
    for (var i = 0; i < si.length; i++) {
      sum2Sq += Math.pow(prefs[p2][si[i]], 2);
    }

    var pSum = 0;
    for (var i = 0; i < si.length; i++) {
      pSum += prefs[p1][si[i]] * prefs[p2][si[i]];
    }

    var num = pSum - (sum1 * sum2 / n); 
    var den = Math.sqrt((sum1Sq - Math.pow(sum1, 2) / n) *
        (sum2Sq - Math.pow(sum2, 2) / n));
  
    if (den < 0.00000001) return 0;
  
    return num / den;
  }

let defaultEntropy=s=>-Math.log(1/s.length)/Math.log(2);
let asciiMap=s=>{
    let r={};
    let chars=s.split('');
    chars.forEach(c=>{
        if (_.isUndefined(r[c]))
            r[c]=0;
        r[c]++;
    });
    Object.keys(r).forEach((key)=>r[key]=r[key]/s.length);
    return r;
};
let entropyFromMap=(aMap)=>{
    let sum=Object.values(aMap).reduce((s,v)=>s+v,0);
    let freq=Object.values(aMap).map(v=>v/sum);
    return -1*freq.reduce((s,v)=>s+v*Math.log(v)/Math.log(2),0); //Shannon's entropy value
};
let entropyValue=s=>s.length?entropyFromMap(asciiMap(s)):0;

let Divergence=(arr)=>{
    let even=1/arr.length;
    return Math.min(1,Math.max(0,arr.reduce((acc,value)=>acc+Math.sqrt(value*even),0)));
}

let wordMap=arr=>{
    let map={};
    arr.forEach(word=>{
        if (!word.length)
            word=emptyWord;
        map[word]=(_.has(map,word)?map[word]+1:1)
    });
    let keys=Object.keys(map);
    keys.forEach(key=>map[key]=map[key]/arr.length);
    return map;
}

let getCategory = (v) =>  {
    if (_.isArray(v))
    {
        let max=Math.max(...v);
        let maxIndex=v.indexOf(max);
        
        if (maxIndex>0 && maxIndex<Object.keys(Categories).length)
            return Object.keys(Categories)[maxIndex];
        return null;
    }
    if (Mapping[v])
        return Mapping[v]; 
    return null; 
}; 

let mapCategoryVector=(vec)=>_.sortBy(vec.map((v,ix)=>({
    weight:v,
    category:Object.keys(Categories)[ix]
})),'weight').reverse();

let getCategoryVector = (cat) =>  {
    let catIndex = Object.keys(Categories); 
    let vector = catIndex.map(v => 0); 
    if (Categories[cat])
        vector[catIndex.indexOf(cat)] = 1; 
    return vector; 
}

let getVector = (s, {row=[],column=[]}) =>  {
    let vector = Frequencies.reduce((obj, v) => Object.assign( {}, obj,  {[v]:0}),  {});

    let symbolDistribution={};

    //Collecting symbol map
    for (let i = 0; i < s.length; i++) {
        let char=s.substring(i,i+1);
        let key = Frequencies.indexOf(char); 
        if (_.isUndefined(key) || key<0)
            key = 'REST'; 
        else
            key=Frequencies[key];
        vector[key]++; 
        if (!(symbolDistribution[key]))
            symbolDistribution[key]=[];
        symbolDistribution[key].push(i);
    }


    //Setting frequencies
    if (s.length)
    Object.keys(vector).forEach((key) =>  {
        if (key.length == 1 || key === 'REST')
            return vector[key] = vector[key]/parseFloat(s.length); 
    }); 

    //Collection symbol and cell value distribution data
    symbolDistribution= Object.values(_.mapObject(symbolDistribution,locations=>locations.reduce((acc,v)=>acc+v,0)/s.length/locations.length)); //finding average position of every symbol
    rowMap=wordMap(row);
    colMap=wordMap(column);
    colWord=_.uniq(column).join('');
    rowWord=_.uniq(row).join('');

    let ent=entropyValue(s);
    vector['LENGTH_X']=rowWord.length?s.length/Math.max(...row.map(v=>v.length)):1; //proportional length (compared to the longest row value)
    vector['LENGTH_Y']=colWord.length?s.length/Math.max(...column.map(v=>v.length)):1; //proportional length (compared to the longest column value)
    vector['FRACTION_X']=column.length?(rowMap[s.length?s:emptyWord] || 0):1; //prevalence of the value in a ROW
    vector['FRACTION_Y']=column.length?(colMap[s.length?s:emptyWord] || 0):1; //prevalence of the value in a COLUMN
    vector['ENTROPY_Y']=Math.min(1,colWord.length?ent*s.length/entropyValue(colWord)/colWord.length:entropyValue(s)/7); //proportion of information contained in a cell compared to column, symbol-wise, assuming that only ASCII range is used
    vector['ENTROPY_X']=Math.min(1,rowWord.length?ent*s.length/entropyValue(rowWord)/rowWord.length:entropyValue(s)/7); // proportion of information contained in a cell compared to row, symbol-wise, assuming that only ASCII range is used
    vector['ENTROPY_ROW']=row.length?Math.max(0,Math.min(1,entropyFromMap(rowMap)/(Math.log(row.length)/Math.log(2)))):1; // proportion of information contained in a cell compared to row, value-wise
    vector['ENTROPY_COLUMN']=column.length?Math.max(0,Math.min(1,entropyFromMap(colMap)/(Math.log(column.length)/Math.log(2)))):1; // proportion of information contained in a cell compared to column, value-wise
    vector['DIVERGENCE']=s.length?Divergence(Object.values(asciiMap(s))):0; //symbol distribution Bhattacharyya coefficient against even distribution
    vector['LOCALITY']=s.length?Math.sqrt((symbolDistribution.reduce((acc,v)=>acc+(v-0.5)*(v-0.5),0)))/Math.sqrt(symbolDistribution.length):1; //symbol average position normalized distance to a symmetrical string
    if (!_.isNumber(vector['ENTROPY_X']))
        {
            console.log(s,[row,column],entropyValue(row),entropyValue(column),entropyValue(s));
            process.exit(0);
        }
    if (Math.max(...Object.values(vector))>1)
    {
        console.log(vector,s,ent,colWord,entropyValue(colWord));
        process.exit(1);
    }
    //console.log(vector, symbolDistribution);
    return Object.values(vector); 
}; 

module.exports =  {Categories, getCategory, Frequencies, getVector, getCategoryVector, mapCategoryVector, pearsonCorrelation}; 