///////////////////////////////////////////////////////////////////////////
// This class provide CRUD operations on JSON objects collection text file
// with the assumption that each object have an Id member.
// If the objectsFile does not exist it will be created on demand.
/////////////////////////////////////////////////////////////////////
// Author : Nicolas Chourot
// Lionel-Groulx College
/////////////////////////////////////////////////////////////////////

const fs = require('fs');
const utilities = require('../utilities.js');
require("../log");

function GetModelFields (model) {
	const notFields = ["validator", "key"]; // set an array to define the invalid fields

	let keys = Object.keys(model);

	return keys.filter(k => !notFields.includes(k));
}

function sortParamFromParams (params, param, objectsList, fields) {
	let paramValue = params[param];

	let _paramValue = paramValue.split(",");
	let descending = _paramValue[_paramValue.length - 1].toLowerCase() == "desc"; // know if we should sort descending or ascending
	
	if (descending)
		paramValue = paramValue.replace(/,[descDESC]+/, "");

	if (fields.includes(paramValue)) { // validate the param value is contained inside the model
		let sorter = (a, b) => { // build the sorter
			a = a[paramValue];
			b = b[paramValue];

			if (!isNaN(a) && !isNaN(b)) {
				a = parseInt(a);
				b = parseInt(b);

				if (descending) {
					return b - a;
				}
				
				return a - b;
				
			}
			else {
				let result;
				if (a > b)
					result = 1;
				else if (a < b)
					result = -1;
				else
					result = 0;

				return descending ? -result : result
			}
		};

		return objectsList.sort(sorter);
	}

}

class Repository {
    constructor(model) {
        this.objectsList = null;
        this.model = model;
        this.objectsName = model.getClassName() + 's';
        this.objectsFile = `./data/${this.objectsName}.json`;
        this.bindExtraDataMethod = null;
        this.updateResult = {
            ok: 0,
            conflict: 1,
            notFound: 2,
            invalid: 3
        }
    }
    setBindExtraDataMethod(bindExtraDataMethod) {
        this.bindExtraDataMethod = bindExtraDataMethod;
    }
    objects() {
        if (this.objectsList == null)
            this.read();
        return this.objectsList;
    }
    read() {
        try {
            let rawdata = fs.readFileSync(this.objectsFile);
            // we assume here that the json data is formatted correctly
            this.objectsList = JSON.parse(rawdata);
        } catch (error) {
            if (error.code === 'ENOENT') {
                // file does not exist, it will be created on demand
                log(FgYellow, `Warning ${this.objectsName} repository does not exist. It will be created on demand`);
                this.objectsList = [];
            } else {
                log(Bright, FgRed, `Error while reading ${this.objectsName} repository`);
                log(Bright, FgRed, '--------------------------------------------------');
                log(Bright, FgRed, error);
            }
        }
    }
    write() {
        fs.writeFileSync(this.objectsFile, JSON.stringify(this.objectsList));
    }
    nextId() {
        let maxId = 0;
        for (let object of this.objects()) {
            if (object.Id > maxId) {
                maxId = object.Id;
            }
        }
        return maxId + 1;
    }
    add(object) {
        try {
            if (this.model.valid(object)) {
                let conflict = false;
                if (this.model.key) {
                    conflict = this.findByField(this.model.key, object[this.model.key]) != null;
                }
                if (!conflict) {
                    object.Id = this.nextId();
                    this.objectsList.push(object);
                    this.write();
                } else {
                    object.conflict = true;
                }
                return object;
            }
            return null;
        } catch (error) {
            console.log(FgRed, `Error adding new item in ${this.objectsName} repository`);
            console.log(FgRed, '-------------------------------------------------------');
            console.log(Bright, FgRed, error);
            return null;
        }
    }
    update(objectToModify) {
        if (this.model.valid(objectToModify)) {
            let conflict = false;
            if (this.model.key) {
                conflict = this.findByField(this.model.key, objectToModify[this.model.key], objectToModify.Id) != null;
            }
            if (!conflict) {
                let index = 0;
                for (let object of this.objects()) {
                    if (object.Id === objectToModify.Id) {
                        this.objectsList[index] = objectToModify;
                        this.write();
                        return this.updateResult.ok;
                    }
                    index++;
                }
                return this.updateResult.notFound;
            } else {
                return this.updateResult.conflict;
            }
        }
        return this.updateResult.invalid;
    }
    remove(id) {
        let index = 0;
        for (let object of this.objects()) {
            if (object.Id === id) {
                this.objectsList.splice(index, 1);
                this.write();
                return true;
            }
            index++;
        }
        return false;
    }
    getAll(params = null) {
        let objectsList = this.objects();
        if (this.bindExtraDataMethod != null) {
            objectsList = this.bindExtraData(objectsList);
        }
        if (params) {
            // TODO Laboratoire 2
			log(BgBlack, FgWhite);

			let fields = GetModelFields(this.model); // get valid model fields
			let paramFields = Object.keys(params);

			paramFields.forEach(param => {
				if (param.toLowerCase() == "sort") {
					objectsList = sortParamFromParams(params, param, objectsList, fields);
				}
				else {
					if (fields.includes(param)) { // validate that the model contains the param
						// filter
						let paramValue = params[param].toLowerCase(); // setting lowercase here because sorting requires EXACT field name
						paramValue = paramValue
							.replaceAll(".", "\\.")
							.replaceAll("*", ".*");
						paramValue = "^" + paramValue + "$";
						
						console.log(`Regex[${param}]: ` + paramValue);

						let regex = new RegExp(paramValue);

						objectsList = objectsList.filter(o => regex.test(o[param].toLowerCase()));
					}
				}
			});
			

			console.log("Objects Name: " + this.objectsName);
			console.log("Model Fields: " + fields);
			console.log("Params: " + JSON.stringify(params));
        }
        return objectsList;
    }
    get(id) {
        for (let object of this.objects()) {
            if (object.Id === id) {
                if (this.bindExtraDataMethod != null)
                    return this.bindExtraDataMethod(object);
                else
                    return object;
            }
        }
        return null;
    }
    removeByIndex(indexToDelete) {
        if (indexToDelete.length > 0) {
            utilities.deleteByIndex(this.objects(), indexToDelete);
            this.write();
        }
    }
    findByField(fieldName, value, excludedId = 0) {
        if (fieldName) {
            let index = 0;
            for (let object of this.objects()) {
                try {
                    if (object[fieldName] === value) {
                        if (object.Id != excludedId)
                            return this.objectsList[index];
                    }
                    index++;
                } catch (error) {
                    break;
                }
            }
        }
        return null;
    }
}

module.exports = Repository;
