import { Info, Candidato, schede, elettori, seggi, query, candidati } from './parser.model';
const pdf2table = require('pdf2table');
const fs = require('fs');

class Parser {
    private info: Info;
    private doc: Target;
    private fileName: string;
    private newList: boolean;

    constructor(fileName: string, dip: any) {
        this.fileName = fileName;

        this.info = {
            schede: {},
            liste: [],
            eletti: [],
            non_eletti: []
        }

        this.newList = false;

        switch (dip) {
            case 0:
                this.doc = new Dipartimento;
                break;
            default:
                this.doc = new Organo();
                break;
        }
    }

    private write(): void {
        const data = JSON.stringify(this.info, null, 4);
        fs.writeFile(this.fileName.replace('.pdf', '') + '.json', data, (errW: any) => {

            if (errW) {
                throw errW;
            }

            console.log('JSON data is saved.');
        });
    }

    private searchPerc(el: any[]): number {
        return el.findIndex(e => e.includes(elettori.PERC));
    }

    private extractPerc(el: any[]) {

        const idxPerc = this.searchPerc(el);

        if (idxPerc != -1) {
            this.info.perc_votanti = el[idxPerc + 1];
        }
    }

    private extractPeople(el: any[], idx: any, eletto: boolean): void {

        // idxList is 0 the first time that this condition is true
        const candidato: Candidato = {
            nominativo: el[0],
            voti: el[1],
            lista: this.info.liste[idx].nome
        };

        if (eletto) {
            this.info.eletti.push(candidato);
        } else {
            this.info.non_eletti.push(candidato);
        }

    }
    private checkEndList(el: any[]): boolean {
        return el[0].includes(seggi.SCRUTINATI);
    }

    private extractCandidati(data: any[], idx: any): void {

        let idxB = this.searchListRef(data);

        while (!this.isMatch(data[idxB][0], idx)) {
            idxB++;
        }

        let candidato = idxB + 2;

        while (!this.checkEndList(data[candidato])) {

            if (this.doc.checkEletto(data[candidato])) {
                this.extractPeople(data[candidato], idx, true);
            }
            else {
                this.extractPeople(data[candidato], idx, false);
            }
            candidato++;
        }
        this.newList = false;
    }

    private searchListRef(data: any[]): number {
        return data.findIndex(e => this.checkEndList(e));
    }

    private isMatch(el: string, idx: any): boolean {
        return el.includes(this.info.liste[idx].nome);
    }

    private extractSchede(el: any[]): void {
        switch (el[0]) {
            case schede.BIANCHE:
            case schede.NULLE:
            case schede.CONTESTATE:
                this.info.schede[el[0]] = el[1];
                break;
            case elettori.TUTTI:
                this.info.elettori = el[1];
                break;
            case elettori.VOTANTI:
                this.info.votanti = el[1];
                break;
        }
    }

    private extractQuoziente(el: any[]): void {
        if (el[0].includes(elettori.QUOZIENTE)) {
            this.info.quoziente = el[1];
        }
    }

    public scrape(): void {
        fs.readFile(this.fileName, (errR: any, buffer: any) => {

            if (errR) {
                return console.log(errR);
            }

            pdf2table.parse(buffer, (errP: any, data: any[]) => {

                if (errP) {
                    return console.log(errP);
                }

                this.doc.scrapeLists(this.info, data);

                let idxList = -1;

                data.forEach((el: any[]) => {
                    if (this.checkEndList(el)) {
                        idxList++;
                        this.newList = true;
                    }

                    if (this.info.liste[idxList] && this.newList) {
                        this.extractCandidati(data, idxList)
                    }

                    this.extractSchede(el);
                    this.extractPerc(el);
                    this.extractQuoziente(el);

                });
                this.write();
            });
        });
    }
}

interface Target {
    scrapeLists(info: Info, data: object): void;
    checkEletto(data: object): boolean;
}

class Dipartimento implements Target {

    public checkEletto(data: any[]): boolean {
        return data[2] === candidati.ELETTO_DIP;
    }

    public scrapeLists(info: Info, data: any[][]): void {
        info.seggi_da_assegnare = data[1][1];
        for (let i = 0; i < data.length; i++) {
            if (data[i][0].includes(query.DIPARTIMENTO)) {
                info.dipartimento = data[++i][0];
            }

            if (data[i][0].includes(candidati.LISTE_DIP)) {
                i = i + 2;
                while (!data[i][0].includes(candidati.VOTI) && !data[i][0].includes(schede.BIANCHE)) {

                    //count the number of total characters of each string
                    const tot = data[i].reduce((acc, pilot) => acc + pilot.length, 0);

                    const tmp = {
                        nome: data[i][0],
                        voti_totali: 0
                    }

                    if (tot < 43) {
                        tmp.voti_totali = parseInt(data[i][1]);
                    }

                    else {
                        tmp.voti_totali = parseInt(data[i][2]);
                    }

                    // console.log(data[i] + " " + " leng: " + tot + " " + " voti: " + tmp.voti_totali); //test
                    info.liste.push(tmp);
                    i++;
                }
            }
        }
    }
}

class Organo implements Target {

    public checkEletto(data: string[]): boolean {
        return data[2] === candidati.ELETTO_ORG;
    }

    public scrapeLists(info: Info, data: any[]): void {
        for (let i = 0; i < data.length; i++) {

            info.seggi_da_assegnare = data[1][2];

            if (data[i][0].includes(query.ORGANI)) {
                info.organo = data[i][0];
            }

            if (data[i][0].includes(candidati.LISTE_ORG)) {
                while (!data[++i][0].includes(candidati.VOTI) && !data[i][0].includes(schede.BIANCHE)) {

                    const tot = data[i].reduce((acc, pilot) => acc + pilot.length, 0);

                    const tmp = {
                        nome: data[i][0],
                        voti_totali: 0
                    }

                    if (tot < 120) {
                        tmp.voti_totali = parseInt(data[i][1]);
                    }

                    else {
                        tmp.voti_totali = parseInt(data[i][3]);
                    }

                    info.liste.push(tmp);
                }
            }
        }
    }
}

const fileName = process.argv[2];
const mode = parseInt(process.argv[3]);
const creator = new Parser(fileName, mode);
creator.scrape();