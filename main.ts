import { Construct } from 'constructs';
import { App, Chart, ChartProps } from 'cdk8s';
import {KubeConfigMap, KubeDeployment, KubeIngress, KubeService} from "./imports/k8s";
import { readFileSync } from 'fs';

export class MyChart extends Chart {
  constructor(scope: Construct, id: string, props: ChartProps = { }) {
    super(scope, id, props);

    // define resources here

    const prometheusCfg = {
      label: { app: `prometheus-${id}` },
      namespace: "<<NAMESPACE>>"
    }
    const cfgMap = new KubeConfigMap(this, 'prometheus-configmap', {
      data: {
        "prometheus.yaml" : readFileSync("./prometheus.yaml")
            .toString()
      }
    })

    new KubeDeployment(this, 'prometheus-deploy', {
      metadata: {
        namespace: prometheusCfg.namespace
      },
      spec: {
        selector: { matchLabels: prometheusCfg.label },
        template: {
          metadata: {
            labels: prometheusCfg.label
          },
          spec: {
            serviceAccount: "<<SERVICE_ACCOUNT>>",
            containers: [
              {
                name: "prometheus",
                image: "prom/prometheus:v2.51.2",
                ports: [{ containerPort: 9090 }],
                args: ['--config.file=/etc/prometheus/prometheus.yaml'],
                volumeMounts: [
                  {
                    name: "prometheus-cfg",
                    mountPath: "/etc/prometheus/prometheus.yaml",
                    subPath: "prometheus.yaml"
                  }
                ]
              }
            ],
            volumes: [
              {
                name: "prometheus-cfg",
                configMap: {
                  name: cfgMap.name,
                  items: [
                    {
                      key: "prometheus.yaml",
                      path: "prometheus.yaml"
                    }
                  ]
                }
              }
            ]
          }
        }
      }
    })

    const service = new KubeService(this, "prometheus-serv", {
      metadata: {
        namespace: prometheusCfg.namespace
      },
      spec: {
        selector: prometheusCfg.label,
        ports: [
          {
            name: "prometheus",
            port: 9090,
            protocol: "TCP"
          }
        ]
      }
    });

    new KubeIngress(this,"prometheus-ingress", {
      metadata: {
        namespace: prometheusCfg.namespace,
        annotations: {
          "alb.ingress.kubernetes.io/load-balancer-name": "<<AWS_ALB_NAME_PREFIX>>-alb",
          "alb.ingress.kubernetes.io/scheme": "internet-facing",
          "alb.ingress.kubernetes.io/group.name": "<<AWS_ALB_NAME_PREFIX>>-tg",
          "alb.ingress.kubernetes.io/target-type": "ip",
        }
      },
      spec: {
        ingressClassName: "alb",
        rules: [
          {
            http: {
              paths: [
                {
                  path: "/",
                  pathType: "Prefix",
                  backend: {
                    service: {
                      name: service.name,
                      port: {
                        number: 9090
                      }
                    }
                  }
                }
              ]
            }
          }
        ]
      }
    })

  }
}

const app = new App();
new MyChart(app, 'cdk8s-eks-prometheus');
app.synth();
