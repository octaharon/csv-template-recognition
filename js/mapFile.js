let fs = require('fs'), _=require('underscore'),
csv = require('fast-csv');

let mapFile=(tpl)=>new Promise((resolve,reject)=>{
    let stream = fs.createReadStream(tpl);
    let file=[];
    let fileData={},fields={};

    let csvStream = csv
        .parse({headers:true})
        .on("data", function(data){
            data=_.mapObject(data,s=>s.trim().replace(/\s +/g, ' '));
            let keys=Object.keys(data);
            let row=Object.values(data);
            if (_.filter(row,v=>!!v).length<3) //skip lines with 2 and less values
                return;
            file.push(data);
        })
        .on("end", function() {
            let lines=_.uniq(file,true,line=>Object.values(line).join(''));
            lines.forEach((line,rowIndex)=>{
                let keys=Object.keys(line);
                keys.forEach((field,ix)=>{
                    field=field.trim().replace('\n',' ').replace(/\s+/g,' ');
                    if (!field)
                        field='field_'+ix;
                    fields[field]=true;
                    //console.log(line,field);
                    if (_.isUndefined(fileData[field]))
                        fileData[field]=[];
                    let v = line[keys[ix]]; 
                    fileData[field].push({
                        value:v,
                        row:Object.values(line),
                        rowIndex,
                        columnIndex:ix
                    });
                 }); 
            });
            //console.log(fileData);
            _.each(fileData, (column,field)=>{
                colData=_.pluck(column,'value');
               if (colData.join('').length<1)
                    fileData[field]=null;
                else
                {
                    fileData[field]=fileData[field].map(obj=>Object.assign(obj,{
                        column:colData
                    }));
                }
            });
            fileData=_.omit(fileData,col=>(col==null)); //discard empty columns
            resolve({data:fileData,filename:tpl,fields,lines:lines.length});
        }); 

        stream.pipe(csvStream); 
    }).catch(console.error);

module.exports=mapFile;