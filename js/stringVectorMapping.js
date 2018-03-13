let _ = require('underscore'), 
fs = require('fs'), 
kmeds = require("k-medoids"),
fingerprint =require('talisman/keyers/fingerprint'),
JaroWinkler=require('talisman/metrics/distance/jaro-winkler'),
Dice=require('talisman/metrics/distance/dice'),
skeleton = require('talisman/keyers/skeleton'),
entropy = require('entropyjs'),
minkowski = require('talisman/metrics/distance/minkowski'),
DamerauLevenshtein=require('talisman/metrics/distance/damerau-levenshtein'), { absolute, updateFrequencies } = require('talisman/stats/frequencies'),  { transliterate, slugify } = require('transliteration'),{sampleCorrelation}=require('talisman/stats/inferential');


let Categories =  JSON.parse(fs.readFileSync('./categories.json'));
if (!_.isObject(Categories))
    throw new Error("Can't read the Categories file"); 

let Mapping =  JSON.parse(fs.readFileSync('./mapping.json'));
if (!_.isObject(Mapping))
    throw new Error("Can't read the Mapping file");

let FrequencyVocabulary=' abcdefghijklmnopqrstuvwxyz1234567890-/+._%$#\'([,'.split('').concat([
    'CAPS',
    'REST'
]);

class StringVectorMapping
{
    toHHMMSS(s) {
        var sec_num = parseInt(s, 10); // don't forget the second param
        var hours   = Math.floor(sec_num / 3600);
        var minutes = Math.floor((sec_num - (hours * 3600)) / 60);
        var seconds = sec_num - (hours * 3600) - (minutes * 60);
    
        if (hours   < 10) {hours   = "0"+hours;}
        if (minutes < 10) {minutes = "0"+minutes;}
        if (seconds < 10) {seconds = "0"+seconds;}
        return hours+':'+minutes+':'+seconds;
    }

    constructor()
    {
        this.param_clusterMultiplier=2;
        this.param_totalPrototypes=20;
        this.param_partitionSize=1500;
        this.param_clusterDistance='Levenstein';
        this.param_embeddingDistance='Levenstein';


        this.nilSymbol='';
        this.nilCategory='~noise';

        this.stringSpace=[];
        this.vectorSpace=[];
        this.prototypeStrings=[];
        this.fields={};
        this.maxDistance=0;

        this.distanceFunctions={
            'JaroWinkler':(a,b)=>JaroWinkler(a,b),
            'Levenstein':(a,b)=>DamerauLevenshtein(a,b),
            'Dice':(a,b)=>Dice(a,b)
        };

    }

    reset()
    {
        this.stringSpace=[];
        this.vectorSpace=[];
        this.fields=[];
        this.maxDistance=0;
    }

    test(activateFn,fileData,prototypesFileName='')
    {
        this.reset();
        if (prototypesFileName)
            this.loadPrototypes(prototypesFileName);
        this.pushFile(fileData,false);
        
        this.embedSpace();
      //  console.log(this.stringSpace.slice(0,5),this.stringSpace.length);
        let tries=0, hits=0,summary={},hitsPerCategory=Object.keys(this.getCategories()).reduce((obj,cat)=>Object.assign(obj,{[cat]:{tries:0,hits:0}}),{});
        this.vectorSpace.forEach(vectorEntity=>{
            let result=activateFn(vectorEntity.vector);
            if (vectorEntity.category!=this.nilCategory)
            {
                tries++;
                if (!hitsPerCategory[vectorEntity.category])
                    {
                        console.log(vectorEntity.category,hitsPerCategory);
                    }
                    else
                    hitsPerCategory[vectorEntity.category]['tries']++
            }
            let guess=this.getCategory(result);
            if (guess==vectorEntity.category && vectorEntity.category!=this.nilCategory)
                {
                    hitsPerCategory[vectorEntity.category]['hits']++;
                    hits++;
                }
            if (_.isUndefined(summary[vectorEntity.column]))
                summary[vectorEntity.column]=[];
            summary[vectorEntity.column].push(result);
        
        });
        summary=_.mapObject(summary,(vectors,col)=>this.mapCategoryVector(
            vectors.reduce((sum,v)=>this.sumVectors(sum,v),this.getCategoryVector(null))
        ).slice(0,5));
        return {
            categories:summary,
            hitRate:hitsPerCategory,
            tries,
            hits
        };
    }

    getCategories(withEmpty=true)
    {
        //let skipCategories=['PSTN','Company']
        if (!withEmpty)
            return Categories;
        return Object.assign({},Categories,{[this.nilCategory]:'Insignificant data'});
    }

    getMapping()
    {
        return Mapping;
    }

    getVectorDistance(vec1,vec2,level=2)
    {
        return minkowski(level,vec1,vec2);
    }

    getMaxDistance()
    {
        if (!this.maxDistance)
            this.maxDistance=_.pluck(this.stringSpace,'value').map(v=>v.length).reduce((memo,l)=>Math.max(memo,l),0);
        return 2*Math.sqrt(this.maxDistance);
    }

    inverseDistance(d,cap=this.getMaxDistance(), base=this.getMaxDistance())
    {
        if (!d) return cap;
        return cap*Math.min(cap,
            1 - ( Math.pow( base,
                Math.pow(d,1/base)
            ) - 1 )/( base-1 )
        ); //1 - (E^x^(1/E) - 1)/(E - 1), thus mapping similarity to metric distance exponentially
    }

    normalizeVector(vector,level=2)
    {
        let divisor=1;
        divisor=Math.pow(_.reduce(vector,(memo,coord)=>memo+Math.pow(coord,level)),1/level);
        return vector.map(v=>v/divisor);
    }

    getCategory(v) {
        if (_.isArray(v))
        {
            let max=Math.max(...v);
            let maxIndex=v.indexOf(max);
            
            if (maxIndex>=0 && maxIndex<Object.keys(Categories).length)
                return Object.keys(Categories)[maxIndex];
            return this.nilCategory;
        }
        if (Mapping[v] && Object.keys(Categories).indexOf(Mapping[v]>-1))
            return Mapping[v]; 
        return null; 
    }; 

    mapCategoryVector(vec,gate=0.1){
        vec=this.normalizeVector(vec,1).map(v=>(v>=gate)?v:0);
        if (Math.max(...vec)<gate)
            return this.nilCategory;
        return _.sortBy(vec.map((v,ix)=>({
            weight:v,
            category:Object.keys(Categories)[ix]
        })),'weight').reverse();
    }

    getCategoryVector (cat) {
        let catIndex = Object.keys(Categories); 
        let vector = catIndex.map(v => 0); 
        if (!cat)
            return vector;
        if (Categories[cat])
            vector[catIndex.indexOf(cat)] = 1; 
        return vector; 
    }

    sumVectors(a,b){
        return a.map((v,ix)=>v+b[ix]||0);
    }

    getStringDistance(stringEntity1,stringEntity2, type=this.param_clusterDistance)
    {
        let df=this.distanceFunctions[type];
        if (type!='Levenstein')
            return this.inverseDistance(df(stringEntity1.value,stringEntity2.value));
        return df(stringEntity1.value,stringEntity2.value);
    }

        pushFile(file,cleanMode=false)
    {
        let tmpSpace=[];
        let keys=Object.keys(file.data);
        this.fields=Object.assign(this.fields,file.fields);
        //console.log(Object.keys(file.data).length, Object.keys(file.fields).length);
        _.each(file.data,(data,columnName)=>{
            columnName=transliterate(columnName);
            let cat=this.getCategory(columnName); //check if mapping applies
            if (cleanMode && cat===null)
                return true; //explicit null mapping removes a column
            _.each(data,obj=>{
                let value=transliterate(obj.value);
                let v=`${skeleton(columnName).toLowerCase()} ${fingerprint(value)}`;
                let freq=absolute(value.toLowerCase().split(''));
                let freqVector={};
                FrequencyVocabulary.forEach(key=>{
                    if (!_.isUndefined(freq[key]))
                        {
                        freqVector[key]=freq[key];
                        freq[key]=0;
                        }
                    else
                        {
                        freqVector[key]=0;
                        }
                });
                freqVector['REST']=_.reduce(_.filter(Object.values(freq),v=>!!v),(a,v)=>a+v,0);
                freqVector['CAPS'] =_.reduce(value.split(''),(a,character)=>{
                    if (character === character.toUpperCase() && character!=character.toLowerCase()) return a+1;
                    return a;
                },0);
                if (v.length>this.maxDistance)
                    this.maxDistance=v.length;
                tmpSpace.push({
                    value:v,
                    frequencies:freqVector,
                    originalValue:obj.value,
                    header:columnName,
                    category:cat || this.nilCategory,
                    column:obj.columnIndex/keys.length,
                    row:obj.rowIndex/data.length
                });
            });
        });
        this.stringSpace=this.stringSpace.concat(_.uniq(tmpSpace,false,(a)=>(a.originalValue+'|'+a.header)));
        return tmpSpace;
    }

    getVectorSpaceDimensions()
    {
        if (!this.prototypeStrings || !this.prototypeStrings.length)
            return 0;
        return this.prototypeStrings.length*2; //string distance, vector distance 
    }

    clusterize(numClusters=0)
    {
        if (!numClusters)
            numClusters=this.param_clusterMultiplier;
        let start=Date.now();
        console.log('Clusterizing started at '+new Date());
        let medoids=[];
        console.log('Categories are',this.getCategories());
        Object.keys(this.getCategories()).forEach((category)=>{
            let slice=_.filter(this.stringSpace,a=>a.category===category);
            if (!slice.length)
            {
                console.log(`Category ${category} is empty, skipped`);
                return;
            }
            if (slice.length<numClusters)
            {
                console.log(`Category ${category} only contains ${slice.length} items, taking them all for medoids`);
                medoids=medoids.concat(slice);
                return;
            }
            console.log(`Clusterizing category ${category}, ${slice.length} items`);
            let clusters=kmeds.Clusterer.getInstance(
                slice,
                numClusters,
                (a,b)=>this.getStringDistance(a,b)
            );
            let c=clusters.getClusteredData();
            console.log(`Found focals: ${_.pluck(clusters.Medoids,'value')}`);
            medoids.push(...clusters.Medoids);
            medoids=_.uniq(medoids,false,v=>v.value);
        });

        
        console.log('Clusterizing finished in '+this.toHHMMSS((Date.now()-start)/1000));
        return medoids;
    }

    clusterizeBinary(numClusters=this.param_totalPrototypes)
    {
        console.log('Clusterizing started at '+new Date());
        let medoids=[], stack=[this.stringSpace], iteration=1;
        console.log('Categories are',_.mapObject(this.getCategories(),(name,key)=>{
            let items=this.stringSpace.filter(v=>v.category===key);
            return `${name}: ${items.length} items`;
        }));
        while (medoids.length<numClusters)
        {
            let slice=_.shuffle(this.stringSpace).slice(0,this.param_partitionSize);
            if (slice.length<2)
            {
                console.log(`Slice only contains ${slice.length} items, taking them all for medoids`);
                medoids=medoids.concat(slice);
                return;
            }
            console.log(`Clusterizing chunk ${iteration++}, ${slice.length} items`);
            let clusters=kmeds.Clusterer.getInstance(
                slice,
                2,
                (a,b)=>this.getStringDistance(a,b)
            );
            let c=clusters.getClusteredData();
            console.log(`Found focals: ${_.pluck(clusters.Medoids,'value')}`);
            medoids.push(...clusters.Medoids);
            medoids=_.uniq(medoids,false,v=>v.value);
            stack.push(...c);  
            console.log(`${medoids.length} prototypes found, ${stack.length} chunks in stack`);
              
        }
        return medoids;
    }

    embedSpace({
        prototypesFileName='',
        fieldsFileName='',
        preprocessedDataFileName=''
    }={})
    {
        console.log(`Total strings in the pool: ${this.stringSpace.length}`);
        if (fieldsFileName.length)
        {
            fs.writeFileSync(fieldsFileName, JSON.stringify(Object.keys(this.fields).reduce((obj, k) => Object.assign(obj,  {[k]:this.getCategory(k)}),  {}))); 
            console.log(`Saved field mapping to ${fieldsFileName}`);
        }
        if (!this.prototypeStrings || !this.prototypeStrings.length)
        {
        console.log('Calculating prototypes...');
        let candidates=[];
       
        if (!candidates || !candidates.length)
            candidates=this.clusterize(this.param_clusterMultiplier);
        if (prototypesFileName)
            fs.writeFileSync(prototypesFileName,JSON.stringify(candidates));
        this.prototypeStrings=candidates;
        }

        console.log('The complexity of input vector is '+this.getVectorSpaceDimensions());
        console.log('Embedding strings...');
        this.stringSpace.forEach((v,ix)=>{
            this.embedString(v);
            if (!ix) return;
            if (ix%250===0 || ix===this.stringSpace.length-1)
                console.log(Math.round((ix+1)/this.stringSpace.length*100)+'% done');
        });

        if (preprocessedDataFileName)
            fs.writeFileSync(preprocessedDataFileName, JSON.stringify(this.vectorSpace));
    }

    loadPrototypes(prototypesFileName='')
    {
        if (prototypesFileName && fs.existsSync(prototypesFileName))
            this.prototypeStrings=JSON.parse(fs.readFileSync(prototypesFileName));
    }

    embedString(stringSpaceItem)
    {
        let vector=new Array(this.getVectorSpaceDimensions());
        let f=Object.values(stringSpaceItem.frequencies);
        this.prototypeStrings.forEach((prototype,ix)=>{
         //console.log(stringSpaceItem,prototype);
            vector[ix*2]=this.getStringDistance(stringSpaceItem,prototype,this.param_embeddingDistance); //string distance from prototype
            vector[ix*2+1]=this.getVectorDistance(f,Object.values(prototype.frequencies)); //frequency distance from prototype
            //vector[ix*2+1]=(sampleCorrelation(Object.values(prototype.frequencies),f)/2+0.5)*this.getMaxDistance(); //symbol freq correlation to prototype 
        });
        vector=this.normalizeVector(vector);
        stringSpaceItem['vector']=vector;
        this.vectorSpace.push({
            vector,
            string:stringSpaceItem.originalValue,
            column:stringSpaceItem.header,
            category:stringSpaceItem.category
        });
        return vector;
    }

    getTrainingData(opts)
    {
        if (!this.vectorSpace.length)
            this.embedSpace(opts);
        return _.shuffle(this.vectorSpace.filter(v=>(v.category!==this.nilCategory)).map(vectorEntity=>{
            return {
                input:vectorEntity.vector,
                output:this.getCategoryVector(vectorEntity.category)
            }
        }));
    }

    




}

let svm=new StringVectorMapping()
    
module.exports=svm;
    
    